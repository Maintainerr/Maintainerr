import { RefreshIcon } from '@heroicons/react/outline'
import { SaveIcon } from '@heroicons/react/solid'
import axios from 'axios'
import { orderBy } from 'lodash-es'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { useSettingsOutletContext } from '..'
import {
  useDeletePlexAuth,
  usePatchSettings,
  useUpdatePlexAuth,
} from '../../../api/settings'
import GetApiHandler from '../../../utils/ApiHandler'
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
  const hostnameRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const portRef = useRef<HTMLInputElement>(null)
  const sslRef = useRef<HTMLInputElement>(null)
  const serverPresetRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | undefined>()
  const [tokenValid, setTokenValid] = useState<boolean>(false)
  const [clearTokenClicked, setClearTokenClicked] = useState<boolean>(false)
  const [testBanner, setTestbanner] = useState<{
    status: boolean
    version: string
  }>({ status: false, version: '' })
  const [availableServers, setAvailableServers] = useState<PlexDevice[]>()
  const [isRefreshingPresets, setIsRefreshingPresets] = useState(false)

  const {
    mutateAsync: updateSettings,
    isPending,
    isSuccess: updateSettingsSuccess,
    isError: updateSettingsError,
  } = usePatchSettings()
  const {
    mutateAsync: deletePlexAuth,
    isSuccess: deletePlexAuthSuccess,
    isError: deletePlexAuthError,
    isPending: deletePlexAuthPending,
  } = useDeletePlexAuth()
  const { mutateAsync: updatePlexAuth, isPending: updatePlexAuthPending } =
    useUpdatePlexAuth()
  const { settings } = useSettingsOutletContext()

  const submit = async (e: React.FormEvent<HTMLFormElement> | undefined) => {
    e?.preventDefault()
    setError(undefined)
    if (
      hostnameRef.current?.value &&
      nameRef.current?.value &&
      portRef.current?.value &&
      sslRef.current !== null
    ) {
      const payload: {
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

      try {
        await updateSettings(payload)
        toast.success('Settings successfully updated!')
      } catch {
        toast.error('Failed to update settings')
      }
    } else {
      setError('Please fill in all required fields.')
      toast.error('Please fill in all required fields.')
    }
  }

  const submitPlexToken = async (
    plex_token?: { plex_auth_token: string } | undefined,
  ) => {
    if (plex_token) {
      await updatePlexAuth(plex_token.plex_auth_token)
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
    setError(undefined)
    verifyToken(token)
    submitPlexToken({ plex_auth_token: token })
  }

  const authFailed = () => {
    setError('Authentication failed')
    toast.error('Authentication failed')
  }

  const deleteToken = async () => {
    await deletePlexAuth()
    setTokenValid(false)
    setClearTokenClicked(false)
  }

  const verifyToken = (token?: string) => {
    if (token) {
      // Fresh token from Plex OAuth — verify directly with plex.tv
      axios
        .get('https://plex.tv/api/v2/user', {
          headers: {
            'X-Plex-Product': 'Maintainerr',
            'X-Plex-Version': '2.0',
            'X-Plex-Client-Identifier': '695b47f5-3c61-4cbd-8eb3-bcc3d6d06ac5',
            'X-Plex-Token': token,
          },
        })
        .then((response) => {
          setTokenValid(response.status === 200 ? true : false)
        })
        .catch(() => setTokenValid(false))
    } else if (settings?.plex_auth_token) {
      // Existing token (masked in settings) — verify via server-side test endpoint
      GetApiHandler<{ status: string; code: number; message: string }>(
        '/settings/test/plex',
      )
        .then((result) => {
          setTokenValid(result.status === 'OK')
        })
        .catch(() => setTokenValid(false))
    } else {
      setTokenValid(false)
    }
  }

  useEffect(() => {
    if (settings?.plex_auth_token) verifyToken()
  }, [settings?.plex_auth_token])

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
      <title>Plex settings - Maintainerr</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">Plex Settings</h3>
          <p className="description">Plex configuration</p>
        </div>

        {error && <Alert type="error" title={error} />}

        {deletePlexAuthError && (
          <Alert
            type="error"
            title="There was an error clearing Plex authentication."
          />
        )}

        {updateSettingsError && (
          <Alert
            type="error"
            title="There was an error updating Plex settings."
          />
        )}

        {(deletePlexAuthSuccess || updateSettingsSuccess) && (
          <Alert type="info" title="Settings successfully updated" />
        )}

        {tokenValid || settings?.plex_auth_token ? (
          ''
        ) : (
          <Alert
            type="info"
            title="Plex configuration is required. Other configuration options will become available after configuring Plex."
          />
        )}

        {testBanner.version ? (
          testBanner.status ? (
            <Alert
              type="info"
              title={`Successfully connected to Plex (${testBanner.version})`}
            />
          ) : (
            <Alert type="error" title={testBanner.version} />
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
                    defaultValue={settings.plex_name}
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
                    defaultValue={settings.plex_hostname
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
                    defaultValue={settings.plex_port}
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
                    defaultChecked={Boolean(settings.plex_ssl)}
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
                        type="button"
                        onClick={deleteToken}
                        buttonType="warning"
                        disabled={deletePlexAuthPending}
                      >
                        Clear credentials?
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => {
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
                      isProcessing={updatePlexAuthPending}
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
                      disabled={isPending}
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
