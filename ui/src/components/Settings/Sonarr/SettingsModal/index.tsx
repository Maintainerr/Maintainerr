import { useState } from 'react'
import { ISonarrSetting } from '..'
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

interface ISonarrSettingsModal {
  onUpdate: (setting: ISonarrSetting) => void
  onCancel: () => void
  settings?: ISonarrSetting
}

interface TestStatus {
  status: boolean
  version: string
}

type SonarrSettingSaveResponse =
  | {
      status: 'OK'
      code: 1
      message: string
      data: ISonarrSetting
    }
  | {
      status: 'NOK'
      code: 0
      message: string
      data?: never
    }

interface SonarrSettingTestResponse {
  status: 'OK' | 'NOK'
  code: 0 | 1
  message: string
}

interface SonarrSettingSaveRequest {
  id?: number
  url: string
  apiKey: string
  serverName: string
}

const SonarrSettingsModal = (props: ISonarrSettingsModal) => {
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

    let sonarrUrl = `${addPortToUrl(hostnameVal, +port)}`
    sonarrUrl = sonarrUrl.endsWith('/') ? sonarrUrl.slice(0, -1) : sonarrUrl

    return sonarrUrl
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
    const sonarrUrl = constructUrl(port)

    if (hostname && port && apiKey && serverName) {
      const payload: SonarrSettingSaveRequest = {
        url: `${sonarrUrl}${baseUrl ? `/${baseUrl}` : ''}`,
        apiKey: apiKey,
        serverName: serverName,
        ...(props.settings?.id && { id: props.settings?.id }),
      }

      if (props.settings?.id) {
        payload.id = props.settings.id
      }

      const endpoint = props.settings?.id
        ? `/settings/sonarr/${props.settings.id}`
        : '/settings/sonarr'

      const handler = props.settings?.id ? PutApiHandler : PostApiHandler

      const resp = await handler<SonarrSettingSaveResponse>(endpoint, payload)
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
    const sonarrUrl = constructUrl(port)

    await PostApiHandler<SonarrSettingTestResponse>('/settings/test/sonarr', {
      apiKey: apiKey,
      url: `${sonarrUrl}${baseUrl ? `/${baseUrl}` : ''}`,
    })
      .then((resp) => {
        setTestResult({
          status: resp.code == 1 ? true : false,
          version: resp.message,
        })

        if (resp.code == 1) {
          setTestedSettings({
            hostname,
            baseUrl,
            port,
            apiKey,
          })
        }

        setTesting(false)
      })
      .catch(() => {
        setTestResult({
          status: false,
          version: '0',
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
      title={'Sonarr Settings'}
      iconSvg={''}
    >
      {error && <Alert type="warning" title="Not all fields contain values" />}

      {testResult != null ? (
        testResult?.status ? (
          <Alert
            type="info"
            title={`Successfully connected to Sonarr (${testResult.version})`}
          />
        ) : (
          <Alert
            type="error"
            title={testResult.version || 'Failed to connect to Sonarr'}
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
          Api key
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
            <DocsButton page="Configuration/#sonarr" />
          </span>
        </div>
      </div>
    </Modal>
  )
}
export default SonarrSettingsModal
