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
import { useForm, useWatch } from 'react-hook-form'
import ReconnectingEventSource from 'reconnecting-eventsource'
import GetApiHandler, {
  API_BASE_PATH,
  PostApiHandler,
} from '../../../utils/ApiHandler'
import { logClientError } from '../../../utils/ClientLogger'
import Button from '../../Common/Button'
import SaveButton from '../../Common/SaveButton'
import Table from '../../Common/Table'
import { InputGroup } from '../../Forms/Input'
import { SelectGroup } from '../../Forms/Select'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'

const LogSettings = () => {
  return (
    <>
      <title>Logs - Maintainerr</title>
      <div className="h-full w-full">
        <LogSettingsForm />
        <Logs />
        <LogFiles />
      </div>
    </>
  )
}

const LogSettingsForm = () => {
  const { feedback, showUpdated, showUpdateError, clearError } =
    useSettingsFeedback('Log settings')

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting, isLoading, defaultValues },
  } = useForm<LogSettingSchemaInput, unknown, LogSettingSchemaOutput>({
    resolver: zodResolver(logSettingSchema),
    defaultValues: async () =>
      await GetApiHandler<LogSetting>('/logs/settings'),
  })

  const values = useWatch({ control })
  const hasChanges =
    values.level !== defaultValues?.level ||
    values.max_size !== defaultValues?.max_size ||
    values.max_files !== defaultValues?.max_files
  const canSave = hasChanges && !isLoading && !isSubmitting

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
        <h3 className="heading">Log Settings</h3>
        <p className="description">Log configuration</p>
      </div>

      <SettingsFeedbackAlert feedback={feedback} />

      <div className="section">
        <form onSubmit={handleSubmit(onSubmit)}>
          <SelectGroup
            label="Level"
            error={errors.level?.message}
            {...register('level')}
          >
            {isLoading && <option value="" disabled></option>}
            <option value="debug">Debug</option>
            <option value="verbose">Verbose</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="fatal">Fatal</option>
          </SelectGroup>

          <InputGroup
            type="number"
            label="Max Size (MB)"
            error={errors.max_size?.message}
            {...register('max_size', {
              valueAsNumber: true,
            })}
            required
          />

          <InputGroup
            type="number"
            label="Max Backups"
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

const Logs = () => {
  const [logLines, setLogLines] = useState<LogEvent[]>([])
  const [logFilter, setLogFilter] = useState<string>('')
  const [scrollToBottom, setScrollToBottom] = useState<boolean>(true)
  const logsRef = useRef<HTMLDivElement>(null)
  const hasLoggedStreamError = useRef(false)

  useEffect(() => {
    const MAX_LOG_LINES = 1000
    const es = new ReconnectingEventSource(`${API_BASE_PATH}/api/logs/stream`)

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
      hasLoggedStreamError.current = false
    }

    es.onerror = (error) => {
      if (hasLoggedStreamError.current) {
        return
      }

      hasLoggedStreamError.current = true
      void logClientError(
        'Log stream connection failed',
        error,
        'Settings.Logs.stream',
      )
    }

    return () => {
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
        <h3 className="heading">Logs</h3>
      </div>

      <div className="section">
        <div className="mb-4 flex flex-col-reverse justify-between gap-4 sm:flex-row">
          <div className="form-input grow !p-0">
            <div className="form-input-field">
              <input
                name="logFilter"
                placeholder="Log filter"
                type="text"
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-4">
            <label htmlFor="active">Scroll to bottom on new message</label>
            <div className="form-input">
              <div className="form-input-field">
                <input
                  type="checkbox"
                  name="scrollToBottom"
                  className="border-zinc-600 hover:border-zinc-500 focus:border-zinc-500 focus:bg-opacity-100 focus:placeholder-zinc-400 focus:outline-none focus:ring-0"
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
          className="h-[60vh] overflow-auto rounded bg-zinc-700 p-2"
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
                <pre className="inline whitespace-pre-wrap break-words text-white">
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
        <h3 className="heading">Log Files</h3>
        <p className="description">Download log files</p>
      </div>
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            <Table.TH>Log file</Table.TH>
            <Table.TH>Size</Table.TH>
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
                    <DownloadIcon className="h-5 w-5 text-amber-500" />
                  </a>
                </Table.TD>
                <Table.TD>{Math.ceil(row.size / 1024)} KB</Table.TD>
              </tr>
            )
          })}
          {!loading && logFiles.length === 0 && (
            <tr>
              <Table.TD colSpan={2} alignText="center">
                No log files found
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
          Previous
        </Button>
        <Button
          buttonType={page === lastPage ? 'default' : 'primary'}
          disabled={page === lastPage}
          onClick={() => setPage((prev) => prev + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
export default LogSettings
