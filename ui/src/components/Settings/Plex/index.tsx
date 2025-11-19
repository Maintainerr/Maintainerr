import { RefreshIcon } from '@heroicons/react/outline'
import { SaveIcon } from '@heroicons/react/solid'
import axios from 'axios'
import { orderBy } from 'lodash-es'
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { toast } from 'react-toastify'
import SettingsContext from '../../../contexts/settings-context'
import GetApiHandler, {
  DeleteApiHandler,
  PostApiHandler,
} from '../../../utils/ApiHandler'
import Alert from '../../Common/Alert'
import Button from '../../Common/Button'
import DocsButton from '../../Common/DocsButton'
import TestButton from '../../Common/TestButton'
import PlexLoginButton from '../../Login/Plex'

interface PresetServerDisplay {
  name: string
  ssl: boolean
  uri: string
  address: string
  port: number
  local: boolean
  status?: boolean
  message?: string
}

interface PlexConnection {
  protocol: string
  ssl: boolean
  uri: string
  address: string
  port: number
  local: boolean
  status: number
  message: string
}

export interface PlexDevice {
  name: string
  product: string
  productVersion: string
  platform: string
  platformVersion: string
  device: string
  clientIdentifier: string
  createdAt: Date
  lastSeenAt: Date
  provides: string[]
  owned: boolean
  accessToken?: string
  publicAddress?: string
  httpsRequired?: boolean
  synced?: boolean
  relay?: boolean
  dnsRebindingProtection?: boolean
  natLoopbackSupported?: boolean
  publicAddressMatches?: boolean
  presence?: boolean
  ownerID?: string
  home?: boolean
  sourceTitle?: string
  connection: PlexConnection[]
}

const PlexSettings = () => {
  const settingsCtx = useContext(SettingsContext)
  const hostnameRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const portRef = useRef<HTMLInputElement>(null)
  const sslRef = useRef<HTMLInputElement>(null)
  const serverPresetRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<boolean>()
  const [changed, setChanged] = useState<boolean>()
  const [tokenValid, setTokenValid] = useState<boolean>(false)
  const [clearTokenClicked, setClearTokenClicked] = useState<boolean>(false)
  const [testBanner, setTestbanner] = useState<{
    status: boolean
    version: string
  }>({ status: false, version: '0' })
  const [availableServers, setAvailableServers] = useState<PlexDevice[]>()
  const [isRefreshingPresets, setIsRefreshingPresets] = useState(false)

  const submit = async (
    e: React.FormEvent<HTMLFormElement> | undefined,
    plex_token?: { plex_auth_token: string } | undefined,
  ) => {
    e?.preventDefault()
    if (
      hostnameRef.current?.value &&
      nameRef.current?.value &&
      portRef.current?.value &&
      sslRef.current !== null
    ) {
      let payload: {
        plex_hostname: string
        plex_port: number
        plex_name: string
        plex_ssl: number
        plex_auth_token?: string
      } = {
        plex_hostname: sslRef.current?.checked
          ? `https://${hostnameRef.current.value
              .replace('http://', '')
              .replace('https://', '')}`
          : hostnameRef.current.value
              .replace('http://', '')
              .replace('https://', ''),
        plex_port: +portRef.current.value,
        plex_name: nameRef.current.value,
        plex_ssl: +sslRef.current.checked, // not used, server derives this from https://
      }

      if (plex_token) {
        payload = {
          ...payload,
          plex_auth_token: plex_token.plex_auth_token,
        }
      }

      const resp: { code: 0 | 1; message: string } = await PostApiHandler(
        '/settings',
        {
          ...settingsCtx.settings,
          ...payload,
        },
      )
      if (resp.code) {
        settingsCtx.addSettings({
          ...settingsCtx.settings,
          ...payload,
        })
        setError(false)
        setChanged(true)
        toast.success('Settings successfully updated!')
      } else {
        setError(true)
        toast.error('Failed to update settings')
      }
    } else {
      setError(true)
      toast.error('Please fill in all required fields.')
    }
  }

  const submitPlexToken = async (
    plex_token?: { plex_auth_token: string } | undefined,
  ) => {
    if (plex_token) {
      const resp: { code: 0 | 1; message: string } = await PostApiHandler(
        '/settings/plex/token',
        {
          plex_auth_token: plex_token.plex_auth_token,
        },
      )
      if (resp.code === 1) {
        settingsCtx.settings.plex_auth_token = plex_token.plex_auth_token
      }
    }
  }

  const availablePresets = useMemo(() => {
    const finalPresets: PresetServerDisplay[] = []
    availableServers?.forEach((dev) => {
      dev.connection.forEach((conn) =>
        finalPresets.push({
          name: dev.name,
          ssl: conn.protocol === 'https',
          uri: conn.uri,
          address: conn.address,
          port: conn.port,
          local: conn.local,
          status: conn.status === 200,
          message: conn.message,
        }),
      )
    })
    return orderBy(finalPresets, ['status', 'ssl'], ['desc', 'desc'])
  }, [availableServers])

  const authsuccess = (token: string) => {
    verifyToken(token)
    submitPlexToken({ plex_auth_token: token })
  }

  const authFailed = () => {
    setError(true)
    toast.error('Authentication failed')
  }

  const deleteToken = async () => {
    const status = await DeleteApiHandler('/settings/plex/auth')

    if (status.code) {
      settingsCtx.addSettings({
        ...settingsCtx.settings,
        plex_auth_token: null,
      })
      setError(false)
      setChanged(true)
      setTokenValid(false)
      setClearTokenClicked(false)
    } else {
      setError(true)
    }
  }

  const verifyToken = (token?: string) => {
    const authToken = token || settingsCtx.settings.plex_auth_token
    if (authToken) {
      const controller = new AbortController()

      axios
        .get('https://plex.tv/api/v2/user', {
          headers: {
            'X-Plex-Product': 'Maintainerr',
            'X-Plex-Version': '2.0',
            'X-Plex-Client-Identifier': '695b47f5-3c61-4cbd-8eb3-bcc3d6d06ac5',
            'X-Plex-Token': authToken,
          },
          signal: controller.signal,
        })
        .then((response) => {
          setTokenValid(response.status === 200 ? true : false)
        })
        .catch(() => setTokenValid(false))

      // Cancel the request if component unmounts
      return () => {
        controller.abort()
      }
    } else {
      setTokenValid(false)
    }
  }

  useEffect(() => {
    if (settingsCtx.settings.plex_auth_token) verifyToken()
  }, [])

  const appTest = (result: { status: boolean; message: string }) => {
    setTestbanner({ status: result.status, version: result.message })
  }

  function setFieldValue(
    ref: React.MutableRefObject<HTMLInputElement | null>,
    value: string,
  ) {
    if (ref.current) {
      if (ref.current.type === 'checkbox') {
        ref.current.checked = value == 'true'
      } else {
        ref.current.value = value
      }
    }
  }

  const refreshPresetServers = async () => {
    setIsRefreshingPresets(true)
    const toastId = 'plex-refresh-preset-servers'

    try {
      const serverPromise = GetApiHandler<PlexDevice[]>(
        '/settings/plex/devices/servers',
      )

      const response = await toast.promise(
        serverPromise,
        {
          pending: 'Retrieving server list from Plex',
          success: 'Plex server list retrieved successfully!',
          error: 'Failed to retrieve Plex server list.',
        },
        {
          toastId,
        },
      )

      setAvailableServers(response)
    } finally {
      setIsRefreshingPresets(false)
    }
  }

  return (
    <>
      <Helmet>
        <title>Maintainerr - Settings - Plex</title>
      </Helmet>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">Plex Settings</h3>
          <p className="description">Plex configuration</p>
        </div>

        {error ? (
          <Alert type="warning" title="Not all fields contain values" />
        ) : changed ? (
          <Alert type="info" title="Settings successfully updated" />
        ) : undefined}

        {tokenValid ? (
          ''
        ) : (
          <Alert
            type="info"
            title="Plex configuration is required. Other configuration options will become available after configuring Plex."
          />
        )}

        {testBanner.version !== '0' ? (
          testBanner.status ? (
            <Alert
              type="info"
              title={`Successfully connected to Plex (${testBanner.version})`}
            />
          ) : (
            <Alert
              type="error"
              title="Connection failed! Double check your entries and make sure to Save Changes before you Test."
            />
          )
        ) : undefined}

        <div className="section">
          <form onSubmit={submit}>
            {/* Load preset server list */}
            <div className="form-row">
              <label htmlFor="preset" className="text-label">
                Server
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  <select
                    id="preset"
                    name="preset"
                    value={serverPresetRef?.current?.value}
                    disabled={
                      (!availableServers || isRefreshingPresets) &&
                      tokenValid === true
                    }
                    className="rounded-l-only"
                    onChange={async (e) => {
                      const targPreset =
                        availablePresets[Number(e.target.value)]
                      if (targPreset) {
                        setFieldValue(nameRef, targPreset.name)
                        setFieldValue(hostnameRef, targPreset.address)
                        setFieldValue(portRef, targPreset.port.toString())
                        setFieldValue(sslRef, targPreset.ssl.toString())
                      }
                    }}
                  >
                    <option value="manual">
                      {availableServers || isRefreshingPresets
                        ? isRefreshingPresets
                          ? 'Retrieving servers...'
                          : 'Manual configuration'
                        : tokenValid === true
                          ? 'Press the button to load available servers'
                          : 'Authenticate to load servers'}
                    </option>
                    {availablePresets.map((server, index) => (
                      <option key={`preset-server-${index}`} value={index}>
                        {`
                            ${server.name} (${server.address})
                            [${server.local ? 'local' : 'remote'}]${
                              server.ssl ? ` [secure]` : ''
                            }
                          `}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      refreshPresetServers()
                    }}
                    disabled={tokenValid !== true}
                    className="input-action"
                  >
                    <RefreshIcon
                      className={isRefreshingPresets ? 'animate-spin' : ''}
                      style={{ animationDirection: 'reverse' }}
                    />
                  </button>
                </div>
              </div>
            </div>
            {/* Name */}
            <div className="form-row">
              <label htmlFor="name" className="text-label">
                Name
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  <input
                    name="name"
                    id="name"
                    type="text"
                    ref={nameRef}
                    defaultValue={settingsCtx.settings.plex_name}
                  ></input>
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
                    ref={hostnameRef}
                    defaultValue={settingsCtx.settings.plex_hostname
                      ?.replace('http://', '')
                      .replace('https://', '')}
                  ></input>
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
                    ref={portRef}
                    defaultValue={settingsCtx.settings.plex_port}
                  ></input>
                </div>
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="ssl" className="text-label">
                SSL
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  <input
                    type="checkbox"
                    name="ssl"
                    id="ssl"
                    defaultChecked={Boolean(settingsCtx.settings.plex_ssl)}
                    ref={sslRef}
                  ></input>
                </div>
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="ssl" className="text-label">
                Authentication
                <span className="label-tip">
                  {`Authentication with the server's admin account is required to access the
                Plex API`}
                </span>
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  {tokenValid ? (
                    clearTokenClicked ? (
                      <Button
                        onClick={(e: React.FormEvent) => {
                          e.preventDefault()
                          deleteToken()
                        }}
                        buttonType="warning"
                      >
                        Clear credentials?
                      </Button>
                    ) : (
                      <Button
                        onClick={(e: React.FormEvent) => {
                          e.preventDefault()
                          setClearTokenClicked(true)
                        }}
                        buttonType="success"
                      >
                        Authenticated
                      </Button>
                    )
                  ) : (
                    <PlexLoginButton
                      onAuthToken={authsuccess}
                      onError={authFailed}
                    ></PlexLoginButton>
                  )}
                </div>
              </div>
            </div>

            <div className="actions mt-5 w-full">
              <div className="flex w-full flex-wrap sm:flex-nowrap">
                <span className="m-auto rounded-md shadow-sm sm:ml-3 sm:mr-auto">
                  <DocsButton page="Configuration/#plex" />
                </span>
                <div className="m-auto mt-3 flex xs:mt-0 sm:m-0 sm:justify-end">
                  <TestButton
                    onTestComplete={appTest}
                    testUrl="/settings/test/plex"
                  />

                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <Button
                      buttonType="primary"
                      type="submit"
                      // disabled={isSubmitting || !isValid}
                    >
                      <SaveIcon />
                      <span>Save Changes</span>
                    </Button>
                  </span>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
export default PlexSettings
