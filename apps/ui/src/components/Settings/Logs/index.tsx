import { Trans, useLingui } from '@lingui/react/macro'
import { DownloadIcon } from '@heroicons/react/solid'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  LogEvent,
  LogFile,
  LogSetting,
  logSettingSchema,
  LogSettingSchemaInput,
  LogSettingSchemaOutput,
} from '@maintainerr/contracts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import ReconnectingEventSource from 'reconnecting-eventsource'
import GetApiHandler, {
  API_BASE_PATH,
  PostApiHandler,
} from '../../../utils/ApiHandler'
import { logClientError } from '../../../utils/ClientLogger'
import Button from '../../Common/Button'
import SaveButton from '../../Common/SaveButton'
import Table from '../../Common/Table'
import { Input, InputGroup } from '../../Forms/Input'
import { SelectGroup } from '../../Forms/Select'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'

const MAX_LOG_LINES = 1000
export const LOG_STREAM_ERROR_DELAY_MS = 5000

const LogSettings = () => {
  const { t } = useLingui()

  return (
    <>
      <title>{t`Logs - Maintainerr`}</title>
      <div className="h-full w-full">
        <LogSettingsForm />
        <Logs />
        <LogFiles />
      </div>
    </>
  )
}

const LogSettingsForm = () => {
  const { t } = useLingui()
  const { feedback, showUpdated, showUpdateError, clearError } =
    useSettingsFeedback({
      updated: t`Log settings updated`,
      updateError: t`Log settings could not be updated`,
    })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isLoading },
  } = useForm<LogSettingSchemaInput, unknown, LogSettingSchemaOutput>({
    resolver: zodResolver(logSettingSchema),
    defaultValues: async () =>
      await GetApiHandler<LogSetting>('/logs/settings'),
  })

  const canSave = !isLoading && !isSubmitting

  const onSubmit = async (data: LogSettingSchemaOutput) => {
    clearError()

    try {
      await PostApiHandler('/logs/settings', data)
      reset(data)
      showUpdated()
    } catch {
      showUpdateError()
    }
  }

  return (
    <div className="section">
      <div className="section h-full w-full">
        <h3 className="heading">
          <Trans>Log Settings</Trans>
        </h3>
        <p className="description">
          <Trans>Log configuration</Trans>
        </p>
      </div>

      <SettingsFeedbackAlert feedback={feedback} />

      <div className="section">
        <form onSubmit={handleSubmit(onSubmit)}>
          <SelectGroup
            label={t`Level`}
            error={errors.level?.message}
            {...register('level')}
          >
            {isLoading && <option value="" disabled></option>}
            <option value="debug">{t`Debug`}</option>
            <option value="verbose">{t`Verbose`}</option>
            <option value="info">{t`Info`}</option>
            <option value="warn">{t`Warn`}</option>
            <option value="error">{t`Error`}</option>
            <option value="fatal">{t`Fatal`}</option>
          </SelectGroup>

          <InputGroup
            type="number"
            // The unit lives outside the message so no translation can alter it.
            label={`${t`Max Size`} (MB)`}
            error={errors.max_size?.message}
            {...register('max_size', {
              valueAsNumber: true,
            })}
            required
          />

          <InputGroup
            type="number"
            label={t`Max Backups`}
            error={errors.max_files?.message}
            {...register('max_files', {
              valueAsNumber: true,
            })}
            required
          />

          <div className="actions mt-5 flex w-full justify-end">
            <SaveButton
              type="submit"
              disabled={!canSave}
              isPending={isLoading || isSubmitting}
            />
          </div>
        </form>
      </div>
    </div>
  )
}

export const Logs = () => {
  const { t } = useLingui()
  const [logLines, setLogLines] = useState<LogEvent[]>([])
  const [logFilter, setLogFilter] = useState<string>('')
  const [scrollToBottom, setScrollToBottom] = useState<boolean>(true)
  const logsRef = useRef<HTMLDivElement>(null)
  const hasLoggedStreamErrorRef = useRef(false)
  const isClosingStreamRef = useRef(false)
  const streamErrorTimeoutRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined)
  const pendingStreamErrorRef = useRef<unknown>(undefined)

  const clearPendingStreamErrorReport = () => {
    if (streamErrorTimeoutRef.current) {
      clearTimeout(streamErrorTimeoutRef.current)
      streamErrorTimeoutRef.current = undefined
    }

    pendingStreamErrorRef.current = undefined
  }

  const reportPendingStreamError = () => {
    streamErrorTimeoutRef.current = undefined

    if (
      isClosingStreamRef.current ||
      hasLoggedStreamErrorRef.current ||
      pendingStreamErrorRef.current === undefined
    ) {
      pendingStreamErrorRef.current = undefined
      return
    }

    hasLoggedStreamErrorRef.current = true
    const error = pendingStreamErrorRef.current
    pendingStreamErrorRef.current = undefined

    void logClientError(
      'Log stream connection failed',
      error,
      'Settings.Logs.stream',
    )
  }

  useEffect(() => {
    const es = new ReconnectingEventSource(`${API_BASE_PATH}/api/logs/stream`)
    isClosingStreamRef.current = false

    const handleLog = (event: MessageEvent) => {
      try {
        const message: LogEvent = JSON.parse(event.data)
        setLogLines((prev) => {
          const newLines = [...prev, message]
          return newLines.slice(-MAX_LOG_LINES)
        })
      } catch (error) {
        void logClientError(
          'Error parsing log stream data',
          error,
          'Settings.Logs.handleLog',
        )
      }
    }

    es.addEventListener('log', handleLog)

    es.onopen = () => {
      clearPendingStreamErrorReport()
      hasLoggedStreamErrorRef.current = false
    }

    es.onerror = (error) => {
      if (isClosingStreamRef.current || hasLoggedStreamErrorRef.current) {
        return
      }

      pendingStreamErrorRef.current = error

      if (streamErrorTimeoutRef.current) {
        return
      }

      // Cleared on cleanup via clearPendingStreamErrorReport(); the rule can't
      // trace clearTimeout through the helper.
      // eslint-disable-next-line @eslint-react/web-api-no-leaked-timeout
      streamErrorTimeoutRef.current = setTimeout(
        reportPendingStreamError,
        LOG_STREAM_ERROR_DELAY_MS,
      )
    }

    return () => {
      isClosingStreamRef.current = true
      clearPendingStreamErrorReport()
      es.removeEventListener('log', handleLog)
      es.close()
      setLogLines([])
    }
  }, [])

  const filteredLogLines = useMemo(() => {
    const filter = logFilter.toLowerCase()
    return logLines.filter(
      (log) =>
        log.message.toLowerCase().includes(filter) ||
        log.level.toLowerCase() == filter,
    )
  }, [logLines, logFilter])

  useEffect(() => {
    if (!scrollToBottom || !logsRef.current) return

    logsRef.current.scrollTop = logsRef.current.scrollHeight
  }, [filteredLogLines, scrollToBottom])

  return (
    <div className="section">
      <div className="section h-full w-full">
        <h3 className="heading">
          <Trans>Logs</Trans>
        </h3>
      </div>

      <div className="section">
        <div className="mb-4 flex flex-col-reverse justify-between gap-4 sm:flex-row">
          <div className="form-input grow p-0!">
            <div className="form-input-field">
              <Input
                name="logFilter"
                placeholder={t`Log filter`}
                type="text"
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-4">
            <label htmlFor="active">
              <Trans>Scroll to bottom on new message</Trans>
            </label>
            <div className="form-input">
              <div className="form-input-field">
                <input
                  type="checkbox"
                  name="scrollToBottom"
                  className="checkbox"
                  checked={scrollToBottom}
                  onChange={() => {
                    setScrollToBottom(!scrollToBottom)
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          className="h-[60vh] overflow-auto rounded-sm bg-zinc-700 p-2"
          ref={logsRef}
        >
          {filteredLogLines.map((row, index: number) => {
            const levelColor =
              row.level === 'ERROR'
                ? 'text-error-400'
                : row.level === 'WARN'
                  ? 'text-yellow-400'
                  : row.level === 'INFO'
                    ? 'text-green-400'
                    : 'text-indigo-400'

            return (
              <div key={`log-list-${index}`} className="font-mono">
                <span className="text-gray-400">
                  {new Date(row.date).toLocaleTimeString()}
                </span>
                <span className={`font-semibold ${levelColor} px-2`}>
                  {row.level}
                </span>
                <pre className="inline wrap-break-word whitespace-pre-wrap text-white">
                  {row.message}
                </pre>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const LogFiles = () => {
  const [logFiles, setLogFiles] = useState<LogFile[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [page, setPage] = useState<number>(1)

  useEffect(() => {
    GetApiHandler<LogFile[]>(`/logs/files`).then((resp) => {
      // Sort the resp by name descending:
      resp.sort((a, b) => {
        if (a.name < b.name) {
          return 1
        }
        if (a.name > b.name) {
          return -1
        }
        return 0
      })

      setLogFiles(resp)
      setLoading(false)
    })
  }, [])

  const filesPerPage = 10
  const lastPage = Math.ceil(logFiles.length / filesPerPage)

  const pagedLogFiles = useMemo(() => {
    const start = (page - 1) * filesPerPage
    const end = start + filesPerPage
    return logFiles.slice(start, end)
  }, [logFiles, page])

  return (
    <div className="section">
      <div className="section h-full w-full">
        <h3 className="heading">
          <Trans>Log Files</Trans>
        </h3>
        <p className="description">
          <Trans>Download log files</Trans>
        </p>
      </div>
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            <Table.TH>
              <Trans>Log file</Trans>
            </Table.TH>
            <Table.TH>
              <Trans>Size</Trans>
            </Table.TH>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-500 bg-zinc-700">
          {pagedLogFiles.map((row, index: number) => {
            return (
              <tr key={`log-${index}`}>
                <Table.TD>
                  <a
                    href={`${API_BASE_PATH}/api/logs/files/${row.name}`}
                    className="flex items-center gap-x-2"
                  >
                    {row.name}
                    <DownloadIcon className="h-5 w-5 text-maintainerr" />
                  </a>
                </Table.TD>
                <Table.TD>{Math.ceil(row.size / 1024)} KB</Table.TD>
              </tr>
            )
          })}
          {!loading && logFiles.length === 0 && (
            <tr>
              <Table.TD colSpan={2} alignText="center">
                <Trans>No log files found</Trans>
              </Table.TD>
            </tr>
          )}
        </tbody>
      </table>
      <div className="actions mt-5 flex w-full justify-end gap-3">
        <Button
          buttonType={page === 1 ? 'default' : 'primary'}
          disabled={page === 1}
          onClick={() => setPage((prev) => prev - 1)}
        >
          <Trans>Previous</Trans>
        </Button>
        <Button
          buttonType={page === lastPage ? 'default' : 'primary'}
          disabled={page === lastPage}
          onClick={() => setPage((prev) => prev + 1)}
        >
          <Trans>Next</Trans>
        </Button>
      </div>
    </div>
  )
}
export default LogSettings
