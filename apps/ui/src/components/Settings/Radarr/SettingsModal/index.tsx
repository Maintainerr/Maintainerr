import { useState } from 'react'
import { IRadarrSetting } from '..'
import {
  getApiErrorMessage,
  normalizeConnectionErrorMessage,
} from '../../../../utils/ApiError'
import { PostApiHandler, PutApiHandler } from '../../../../utils/ApiHandler'
import {
  addPortToUrl,
  getBaseUrl,
  getHostname,
  getPortFromUrl,
} from '../../../../utils/SettingsUtils'
import Alert from '../../../Common/Alert'
import DocsButton from '../../../Common/DocsButton'
import Modal from '../../../Common/Modal'

interface IRadarrSettingsModal {
  onUpdate: (setting: IRadarrSetting) => void
  onCancel: () => void
  settings?: IRadarrSetting
}

interface TestStatus {
  status: boolean
  version: string
}

type RadarrSettingSaveResponse =
  | {
      status: 'OK'
      code: 1
      message: string
      data: IRadarrSetting
    }
  | {
      status: 'NOK'
      code: 0
      message: string
      data?: never
    }

interface RadarrSettingTestResponse {
  status: 'OK' | 'NOK'
  code: 0 | 1
  message: string
}

interface RadarrSettingSaveRequest {
  id?: number
  url: string
  apiKey: string
  serverName: string
}

const RadarrSettingsModal = (props: IRadarrSettingsModal) => {
  const handleCancel = () => {
    props.onCancel()
  }

  const initialHostname = props.settings?.url
    ? (getHostname(props.settings.url) ?? '')
    : ''
  const initialBaseUrl = props.settings?.url
    ? (getBaseUrl(props.settings.url) ?? '')
    : ''
  const initialPort = props.settings?.url
    ? (getPortFromUrl(props.settings.url) ?? '')
    : ''
  const initialApiKey = props.settings?.apiKey ?? ''
  const initialServerName = props.settings?.serverName ?? ''

  const [hostname, setHostname] = useState<string>(initialHostname)
  const [baseUrl, setBaseUrl] = useState<string>(initialBaseUrl)
  const [port, setPort] = useState<string>(initialPort)
  const [apiKey, setApiKey] = useState<string>(initialApiKey)
  const [serverName, setServerName] = useState<string>(initialServerName)

  const [error, setError] = useState<boolean>()
  const [testedSettings, setTestedSettings] = useState(
    props.settings
      ? {
          hostname,
          baseUrl,
          port,
          apiKey,
        }
      : undefined,
  )
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestStatus>()

  const requiresTest =
    (hostname != testedSettings?.hostname ||
      baseUrl != testedSettings?.baseUrl ||
      port != testedSettings?.port ||
      apiKey != testedSettings?.apiKey) &&
    !testResult?.status

  const constructUrl = (port: string) => {
    const hostnameVal = hostname.includes('http://')
      ? hostname
      : hostname.includes('https://')
        ? hostname
        : port == '443'
          ? 'https://' + hostname
          : 'http://' + hostname

    let radarrUrl = `${addPortToUrl(hostnameVal, +port)}`
    radarrUrl = radarrUrl.endsWith('/') ? radarrUrl.slice(0, -1) : radarrUrl

    return radarrUrl
  }

  const derivePort = () => {
    // if port not specified, but hostname is. Derive the port
    if (!port && hostname) {
      const derivedPort = hostname.includes('http://')
        ? '80'
        : hostname.includes('https://')
          ? '443'
          : '80'

      if (derivedPort) {
        setPort(derivedPort.toString())
        return derivedPort
      }
    }

    return port
  }

  const handleSubmit = async () => {
    const port = derivePort()
    const radarrUrl = constructUrl(port)

    if (hostname && port && apiKey && serverName) {
      const payload: RadarrSettingSaveRequest = {
        url: `${radarrUrl}${baseUrl ? `/${baseUrl}` : ''}`,
        apiKey: apiKey,
        serverName: serverName,
        ...(props.settings?.id && { id: props.settings?.id }),
      }

      if (props.settings?.id) {
        payload.id = props.settings.id
      }

      const endpoint = props.settings?.id
        ? `/settings/radarr/${props.settings.id}`
        : '/settings/radarr'

      const handler = props.settings?.id ? PutApiHandler : PostApiHandler

      const resp = await handler<RadarrSettingSaveResponse>(endpoint, payload)
      if (resp.code == 1) {
        props.onUpdate(resp.data)
        setError(false)
      } else setError(true)
    } else {
      setError(true)
    }
  }

  const performTest = async () => {
    if (testing) return

    setTesting(true)
    const port = derivePort()
    const radarrUrl = constructUrl(port)

    await PostApiHandler<RadarrSettingTestResponse>('/settings/test/radarr', {
      apiKey: apiKey,
      url: `${radarrUrl}${baseUrl ? `/${baseUrl}` : ''}`,
    })
      .then((resp) => {
        setTestResult({
          status: resp.code == 1 ? true : false,
          version: normalizeConnectionErrorMessage(
            resp.message,
            'Failed to connect to Radarr. Verify URL and API key.',
          ),
        })

        if (resp.code == 1) {
          setTestedSettings({
            hostname,
            baseUrl,
            port,
            apiKey,
          })
        }
      })
      .catch((err: unknown) => {
        setTestResult({
          status: false,
          version: getApiErrorMessage(
            err,
            'Failed to connect to Radarr. Verify URL and API key.',
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
      onCancel={handleCancel}
      onOk={handleSubmit}
      okText={'Save Changes'}
      okButtonType={'primary'}
      okDisabled={requiresTest}
      secondaryButtonType="success"
      secondaryText={testing ? 'Testing...' : 'Test'}
      secondaryDisabled={testing}
      onSecondary={performTest}
      title={'Radarr Settings'}
      iconSvg={''}
    >
      {error && <Alert type="warning" title="Not all fields contain values" />}

      {testResult != null ? (
        testResult?.status ? (
          <Alert
            type="info"
            title={`Successfully connected to Radarr (${testResult.version})`}
          />
        ) : (
          <Alert
            type="error"
            title={testResult.version || 'Failed to connect to Radarr'}
          />
        )
      ) : undefined}

      <div className="form-row">
        <label htmlFor="serverName" className="text-label">
          Server Name
        </label>
        <div className="form-input">
          <div className="form-input-field">
            <input
              name="serverName"
              id="serverName"
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
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
              name="hostname"
              id="hostname"
              type="text"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
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
              name="port"
              id="port"
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="form-row">
        <label htmlFor="baseUrl" className="text-label">
          Base URL
          <span className="label-tip">{`No Leading Slash`}</span>
        </label>
        <div className="form-input">
          <div className="form-input-field">
            <input
              name="baseUrl"
              id="baseUrl"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
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
              name="apikey"
              id="apikey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="actions mt-5 w-full">
        <div className="flex w-full flex-wrap sm:flex-nowrap">
          <span className="m-auto rounded-md shadow-sm sm:ml-3 sm:mr-auto">
            <DocsButton page="Configuration/#radarr" />
          </span>
        </div>
      </div>
    </Modal>
  )
}
export default RadarrSettingsModal
