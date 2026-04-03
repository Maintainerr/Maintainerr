import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import {
  getApiErrorMessage,
  normalizeConnectionErrorMessage,
} from '../../../utils/ApiError'
import { PostApiHandler, PutApiHandler } from '../../../utils/ApiHandler'
import {
  addPortToUrl,
  getBaseUrl,
  getHostname,
  getPortFromUrl,
} from '../../../utils/SettingsUtils'
import Alert from '../../Common/Alert'
import DocsButton from '../../Common/DocsButton'
import Modal from '../../Common/Modal'
import { SaveButtonContent } from '../../Common/SaveButton'
import {
  getTestingButtonType,
  TestingButtonContent,
} from '../../Common/TestingButton'
import SettingsAlertSlot from '../SettingsAlertSlot'

interface ServarrSettingShape {
  id?: number
  serverName: string
  url: string
  apiKey: string
}

interface ServarrFormState {
  serverName: string
  hostname: string
  port: string
  baseUrl: string
  apiKey: string
}

interface TestStatus {
  status: boolean
  version: string
}

type ServarrSaveResponse<TSetting extends ServarrSettingShape> =
  | {
      status: 'OK'
      code: 1
      message: string
      data: TSetting
    }
  | {
      status: 'NOK'
      code: 0
      message: string
      data?: never
    }

interface ServarrTestResponse {
  status: 'OK' | 'NOK'
  code: 0 | 1
  message: string
}

interface ServarrSettingsModalProps<TSetting extends ServarrSettingShape> {
  title: string
  docsPage: string
  settingsPath: string
  testPath: string
  serviceName: string
  settings?: TSetting
  onUpdate: (setting: TSetting) => void
  onDelete: (id: number) => Promise<boolean>
  onCancel: () => void
}

const isEmptyServarrState = (state: ServarrFormState) =>
  state.serverName === '' &&
  state.hostname === '' &&
  state.port === '' &&
  state.baseUrl === '' &&
  state.apiKey === ''

const resolveServarrPort = ({ hostname, port }: ServarrFormState) => {
  if (port !== '' || hostname === '') {
    return port
  }

  return hostname.includes('https://') ? '443' : '80'
}

const buildInitialState = <TSetting extends ServarrSettingShape>(
  settings?: TSetting,
): ServarrFormState => ({
  serverName: settings?.serverName ?? '',
  hostname: settings?.url ? (getHostname(settings.url) ?? '') : '',
  port: settings?.url ? (getPortFromUrl(settings.url) ?? '') : '',
  baseUrl: settings?.url ? (getBaseUrl(settings.url) ?? '') : '',
  apiKey: settings?.apiKey ?? '',
})

const areMatchingStates = (
  left: ServarrFormState,
  right?: ServarrFormState,
) => {
  if (!right) {
    return false
  }

  return (
    left.serverName === right.serverName &&
    left.hostname === right.hostname &&
    left.port === right.port &&
    left.baseUrl === right.baseUrl &&
    left.apiKey === right.apiKey
  )
}

const buildServarrPayload = <TSetting extends ServarrSettingShape>(
  state: ServarrFormState,
  settings?: TSetting,
) => {
  const port = resolveServarrPort(state)
  const hostnameValue = state.hostname.includes('://')
    ? state.hostname
    : port === '443'
      ? `https://${state.hostname}`
      : `http://${state.hostname}`

  const normalizedUrl = addPortToUrl(hostnameValue, Number(port))
  const url = normalizedUrl.endsWith('/')
    ? normalizedUrl.slice(0, -1)
    : normalizedUrl

  return {
    payload: {
      url: `${url}${state.baseUrl ? `/${state.baseUrl}` : ''}`,
      apiKey: state.apiKey,
      serverName: state.serverName,
      ...(settings?.id ? { id: settings.id } : {}),
    },
    port,
  }
}

const ServarrSettingsModal = <TSetting extends ServarrSettingShape>({
  title,
  docsPage,
  settingsPath,
  testPath,
  serviceName,
  settings,
  onUpdate,
  onDelete,
  onCancel,
}: ServarrSettingsModalProps<TSetting>) => {
  const initialState = useMemo(() => buildInitialState(settings), [settings])
  const [errorMessage, setErrorMessage] = useState<string>()
  const [testedState, setTestedState] = useState<ServarrFormState | undefined>(
    settings ? initialState : undefined,
  )
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestStatus>()

  const { register, handleSubmit, control, getValues, reset } =
    useForm<ServarrFormState>({
      defaultValues: initialState,
    })

  const serverName = useWatch({ control, name: 'serverName' }) ?? ''
  const hostname = useWatch({ control, name: 'hostname' }) ?? ''
  const port = useWatch({ control, name: 'port' }) ?? ''
  const baseUrl = useWatch({ control, name: 'baseUrl' }) ?? ''
  const apiKey = useWatch({ control, name: 'apiKey' }) ?? ''

  const currentState = useMemo<ServarrFormState>(
    () => ({
      serverName,
      hostname,
      port,
      baseUrl,
      apiKey,
    }),
    [apiKey, baseUrl, hostname, port, serverName],
  )

  useEffect(() => {
    reset(initialState)
    setTestedState(settings ? initialState : undefined)
  }, [initialState, reset, settings])

  const hasChanges = !areMatchingStates(currentState, initialState)
  const isClearingExistingSetting =
    settings?.id != null && isEmptyServarrState(currentState)
  const canSave =
    hasChanges &&
    !saving &&
    (isClearingExistingSetting ||
      (currentState.hostname !== '' &&
        currentState.apiKey !== '' &&
        currentState.serverName !== ''))
  const testFeedbackStatus = areMatchingStates(currentState, testedState)
    ? testResult?.status
    : undefined

  const clearFeedback = () => {
    setErrorMessage(undefined)
    setTestResult(undefined)
  }

  const saveSettings = async (values: ServarrFormState) => {
    clearFeedback()

    if (settings?.id != null && isEmptyServarrState(values)) {
      const id = settings?.id

      if (id == null) {
        setErrorMessage(`Failed to remove ${serviceName} settings.`)
        return
      }

      setSaving(true)

      try {
        const wasDeleted = await onDelete(id)

        if (!wasDeleted) {
          setErrorMessage(`Failed to remove ${serviceName} settings.`)
        }
      } catch {
        setErrorMessage(`Failed to remove ${serviceName} settings.`)
      } finally {
        setSaving(false)
      }

      return
    }

    const { payload, port } = buildServarrPayload(values, settings)

    if (
      values.hostname === '' ||
      port === '' ||
      values.apiKey === '' ||
      values.serverName === ''
    ) {
      setErrorMessage(
        `Please fill in all required ${serviceName} fields or clear all fields to remove this server.`,
      )
      return
    }

    const endpoint = settings?.id
      ? `${settingsPath}/${settings.id}`
      : settingsPath
    const handler = settings?.id ? PutApiHandler : PostApiHandler

    setSaving(true)

    try {
      const response = await handler<ServarrSaveResponse<TSetting>>(
        endpoint,
        payload,
      )

      if (response.code === 1) {
        onUpdate(response.data)
      } else {
        setErrorMessage(`Failed to update ${serviceName} settings.`)
      }
    } catch {
      setErrorMessage(`Failed to update ${serviceName} settings.`)
    } finally {
      setSaving(false)
    }
  }

  const performTest = async () => {
    if (testing) {
      return
    }

    const values = getValues()
    const { payload, port } = buildServarrPayload(values, settings)

    setTesting(true)

    await PostApiHandler<ServarrTestResponse>(testPath, payload)
      .then((response: ServarrTestResponse) => {
        setTestResult({
          status: response.code === 1,
          version: normalizeConnectionErrorMessage(
            response.message,
            `Failed to connect to ${serviceName}. Verify URL and API key.`,
          ),
        })

        if (response.code === 1) {
          setTestedState({ ...values, port })
        }
      })
      .catch((error: unknown) => {
        setTestResult({
          status: false,
          version: getApiErrorMessage(
            error,
            `Failed to connect to ${serviceName}. Verify URL and API key.`,
          ),
        })
      })
      .finally(() => {
        setTesting(false)
      })
  }

  return (
    <Modal
      loading={false}
      backgroundClickable={false}
      onCancel={onCancel}
      onOk={() => {
        void handleSubmit(saveSettings)()
      }}
      okContent={<SaveButtonContent isPending={saving} />}
      okButtonType="primary"
      okDisabled={!canSave}
      secondaryButtonType={getTestingButtonType(
        'success',
        testFeedbackStatus,
        testing,
      )}
      secondaryDisabled={testing || isClearingExistingSetting}
      secondaryContent={
        <TestingButtonContent
          isPending={testing}
          feedbackStatus={testFeedbackStatus}
        />
      }
      onSecondary={performTest}
      title={title}
      iconSvg=""
    >
      <SettingsAlertSlot>
        {errorMessage || testResult ? (
          <div className="space-y-4">
            {errorMessage ? (
              <Alert type="warning" title={errorMessage} />
            ) : null}
            {testResult ? (
              <Alert
                type={testResult.status ? 'success' : 'error'}
                title={
                  testResult.status
                    ? `Successfully connected to ${serviceName} (${testResult.version})`
                    : testResult.version ||
                      `Failed to connect to ${serviceName}`
                }
              />
            ) : null}
          </div>
        ) : null}
      </SettingsAlertSlot>

      <div className="form-row">
        <label htmlFor="serverName" className="text-label">
          Server Name
        </label>
        <div className="form-input">
          <div className="form-input-field">
            <input
              id="serverName"
              type="text"
              {...register('serverName', { onChange: clearFeedback })}
            />
          </div>
        </div>
      </div>

      <div className="form-row">
        <label htmlFor="hostname" className="text-label">
          Hostname or IP
        </label>
        <div className="form-input">
          <div className="form-input-field">
            <input
              id="hostname"
              type="text"
              {...register('hostname', { onChange: clearFeedback })}
            />
          </div>
        </div>
      </div>

      <div className="form-row">
        <label htmlFor="port" className="text-label">
          Port
        </label>
        <div className="form-input">
          <div className="form-input-field">
            <input
              id="port"
              type="number"
              {...register('port', { onChange: clearFeedback })}
            />
          </div>
        </div>
      </div>

      <div className="form-row">
        <label htmlFor="baseUrl" className="text-label">
          Base URL
          <span className="label-tip">No Leading Slash</span>
        </label>
        <div className="form-input">
          <div className="form-input-field">
            <input
              id="baseUrl"
              type="text"
              {...register('baseUrl', { onChange: clearFeedback })}
            />
          </div>
        </div>
      </div>

      <div className="form-row">
        <label htmlFor="apikey" className="text-label">
          API key
        </label>
        <div className="form-input">
          <div className="form-input-field">
            <input
              id="apikey"
              type="password"
              {...register('apiKey', { onChange: clearFeedback })}
            />
          </div>
        </div>
      </div>

      <div className="actions mt-5 w-full">
        <div className="flex w-full flex-wrap sm:flex-nowrap">
          <span className="m-auto rounded-md shadow-sm sm:ml-3 sm:mr-auto">
            <DocsButton page={docsPage} />
          </span>
        </div>
      </div>
    </Modal>
  )
}

export default ServarrSettingsModal
