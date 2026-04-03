import { RefreshIcon } from '@heroicons/react/outline'
import axios from 'axios'
import { orderBy } from 'lodash-es'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'react-toastify'
import { useSettingsOutletContext } from '..'
import {
  useDeletePlexAuth,
  usePatchSettings,
  useUpdatePlexAuth,
} from '../../../api/settings'
import {
  getApiErrorMessage,
  normalizeConnectionErrorMessage,
} from '../../../utils/ApiError'
import GetApiHandler from '../../../utils/ApiHandler'
import Alert from '../../Common/Alert'
import Button from '../../Common/Button'
import DocsButton from '../../Common/DocsButton'
import SaveButton from '../../Common/SaveButton'
import TestingButton from '../../Common/TestingButton'
import PlexLoginButton from '../../Login/Plex'
import SettingsAlertSlot from '../SettingsAlertSlot'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'

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

export interface PlexServerFormState {
  hostname: string
  port: string
  name: string
  ssl: boolean
}

const normalizePlexHostname = (hostname?: string) =>
  hostname?.replace('http://', '').replace('https://', '') ?? ''

const buildPlexServerState = (settings?: {
  plex_hostname?: string
  plex_port?: number
  plex_name?: string
  plex_ssl?: number
}): PlexServerFormState => ({
  hostname: normalizePlexHostname(settings?.plex_hostname),
  port: settings?.plex_port != null ? String(settings.plex_port) : '',
  name: settings?.plex_name ?? '',
  ssl: Boolean(settings?.plex_ssl),
})

const isCompletePlexServerState = (state: PlexServerFormState) =>
  state.hostname !== '' && state.port !== '' && state.name !== ''

const buildPlexServerPayload = (state: PlexServerFormState) => {
  const normalizedHostname = normalizePlexHostname(state.hostname)

  return {
    plex_hostname: state.ssl
      ? `https://${normalizedHostname}`
      : normalizedHostname,
    plex_port: Number(state.port),
    plex_name: state.name,
    plex_ssl: Number(state.ssl),
  }
}

export const hasUnsavedPlexServerChanges = (
  current: PlexServerFormState,
  saved: PlexServerFormState,
) => {
  return (
    current.hostname !== saved.hostname ||
    current.port !== saved.port ||
    current.name !== saved.name ||
    current.ssl !== saved.ssl
  )
}

const PlexSettings = () => {
  const [tokenValid, setTokenValid] = useState<boolean>(false)
  const [clearTokenClicked, setClearTokenClicked] = useState<boolean>(false)
  const [manualToken, setManualToken] = useState('')
  const [selectedPreset, setSelectedPreset] = useState('manual')
  const [testBanner, setTestbanner] = useState<{
    status: boolean
    version: string
  }>({ status: false, version: '' })
  const [testing, setTesting] = useState(false)
  const [availableServers, setAvailableServers] = useState<PlexDevice[]>()
  const [isRefreshingPresets, setIsRefreshingPresets] = useState(false)
  const {
    feedback,
    showUpdated,
    showUpdateError,
    showError,
    showWarning,
    clearError,
  } = useSettingsFeedback('Plex settings')

  const { mutateAsync: updateSettings, isPending } = usePatchSettings()
  const { mutateAsync: deletePlexAuth, isPending: deletePlexAuthPending } =
    useDeletePlexAuth()
  const { mutateAsync: updatePlexAuth, isPending: updatePlexAuthPending } =
    useUpdatePlexAuth()
  const { settings } = useSettingsOutletContext()
  const hasStoredPlexCredentials =
    tokenValid || Boolean(settings?.plex_auth_token)

  const initialServerState = useMemo(
    () => buildPlexServerState(settings),
    [
      settings?.plex_auth_token,
      settings?.plex_hostname,
      settings?.plex_name,
      settings?.plex_port,
      settings?.plex_ssl,
    ],
  )

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    control,
    formState: { defaultValues },
  } = useForm<PlexServerFormState>({
    defaultValues: initialServerState,
  })

  const clearTestBanner = useCallback(() => {
    setTestbanner({ status: false, version: '' })
  }, [])

  const hostname = useWatch({ control, name: 'hostname' }) ?? ''
  const port = useWatch({ control, name: 'port' }) ?? ''
  const name = useWatch({ control, name: 'name' }) ?? ''
  const ssl = Boolean(useWatch({ control, name: 'ssl' }))

  const currentServerState = useMemo<PlexServerFormState>(
    () => ({
      hostname: normalizePlexHostname(hostname),
      port,
      name,
      ssl,
    }),
    [hostname, name, port, ssl],
  )

  const savedServerState = useMemo<PlexServerFormState>(
    () => ({
      hostname: normalizePlexHostname(defaultValues?.hostname),
      port: defaultValues?.port ?? '',
      name: defaultValues?.name ?? '',
      ssl: Boolean(defaultValues?.ssl),
    }),
    [
      defaultValues?.hostname,
      defaultValues?.name,
      defaultValues?.port,
      defaultValues?.ssl,
    ],
  )

  const hasUnsavedServerChanges = useMemo(
    () => hasUnsavedPlexServerChanges(currentServerState, savedServerState),
    [currentServerState, savedServerState],
  )

  const clearServerSettingsFeedback = useCallback(() => {
    clearError()
    clearTestBanner()
    setSelectedPreset('manual')
  }, [clearError, clearTestBanner])

  useEffect(() => {
    reset(initialServerState)
    setSelectedPreset('manual')
  }, [initialServerState, reset])

  const submit = async (values: PlexServerFormState) => {
    clearError()

    if (!hasStoredPlexCredentials) {
      showWarning('Authenticate with Plex before saving server settings.')
      return
    }

    const normalizedValues = {
      ...values,
      hostname: normalizePlexHostname(values.hostname),
    }

    if (!isCompletePlexServerState(normalizedValues)) {
      showError('Please fill in all required fields.')
      return
    }

    try {
      await updateSettings(buildPlexServerPayload(normalizedValues))
      reset(normalizedValues)
      clearTestBanner()
      showUpdated()
    } catch {
      showUpdateError()
    }
  }

  const submitPlexToken = async (
    plex_token?: { plex_auth_token: string } | undefined,
  ) => {
    if (plex_token) {
      try {
        await updatePlexAuth(plex_token.plex_auth_token)
        showUpdated()
        return true
      } catch {
        showError('There was an error updating Plex authentication.')
      }
    }

    return false
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

  const authsuccess = async (token: string) => {
    await persistToken(token)
  }

  const persistToken = async (
    token: string,
    { clearManualInput = false }: { clearManualInput?: boolean } = {},
  ) => {
    clearError()
    clearTestBanner()
    setTokenValid(false)

    const didPersistToken = await submitPlexToken({ plex_auth_token: token })

    if (didPersistToken) {
      if (clearManualInput) {
        setManualToken('')
      }

      verifyToken(token)
    }
  }

  const authFailed = () => {
    showError('Authentication failed')
  }

  const saveManualToken = async () => {
    clearError()
    clearTestBanner()

    const trimmedToken = manualToken.trim()

    if (!trimmedToken) {
      showWarning('Enter a Plex token before saving authentication.')
      return
    }

    await persistToken(trimmedToken, { clearManualInput: true })
  }

  const deleteToken = async () => {
    clearError()

    try {
      await deletePlexAuth()
      setTokenValid(false)
      setClearTokenClicked(false)
      showUpdated()
    } catch {
      showError('There was an error clearing Plex authentication.')
    }
  }

  const verifyToken = useCallback(
    (token?: string) => {
      if (token) {
        // Fresh token from Plex OAuth — verify directly with plex.tv
        axios
          .get('https://plex.tv/api/v2/user', {
            headers: {
              'X-Plex-Product': 'Maintainerr',
              'X-Plex-Version': '2.0',
              'X-Plex-Client-Identifier':
                '695b47f5-3c61-4cbd-8eb3-bcc3d6d06ac5',
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
    },
    [settings?.plex_auth_token],
  )

  useEffect(() => {
    if (settings?.plex_auth_token) {
      verifyToken()
    }
  }, [settings?.plex_auth_token, verifyToken])

  const performTest = async () => {
    if (testing) return

    if (updatePlexAuthPending) {
      showWarning('Wait for Plex authentication to finish before testing.')
      return
    }

    if (!hasStoredPlexCredentials) {
      showWarning('Authenticate with Plex before testing the connection.')
      return
    }

    if (hasUnsavedServerChanges) {
      showWarning('Save changes before testing the Plex connection.')
      return
    }

    setTesting(true)

    try {
      const result = await GetApiHandler<{
        status: 'OK' | 'NOK'
        code: 0 | 1
        message: string
      }>('/settings/test/plex')

      setTestbanner({
        status: result.code === 1,
        version: normalizeConnectionErrorMessage(
          result.message,
          'Failed to connect to Plex. Verify your Plex configuration.',
        ),
      })
    } catch (error) {
      setTestbanner({
        status: false,
        version: getApiErrorMessage(
          error,
          'Failed to connect to Plex. Verify your Plex configuration.',
        ),
      })
    } finally {
      setTesting(false)
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

        <SettingsFeedbackAlert feedback={feedback} />

        {tokenValid || settings?.plex_auth_token ? (
          ''
        ) : (
          <Alert
            type="info"
            title="Plex configuration is required. Other configuration options will become available after configuring Plex."
          />
        )}

        <SettingsAlertSlot>
          {testBanner.version ? (
            testBanner.status ? (
              <Alert
                type="info"
                title={`Successfully connected to Plex (${testBanner.version})`}
              />
            ) : (
              <Alert type="error" title={testBanner.version} />
            )
          ) : null}
        </SettingsAlertSlot>

        <div className="section">
          <form onSubmit={handleSubmit(submit)}>
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
                    value={selectedPreset}
                    disabled={
                      (!availableServers || isRefreshingPresets) &&
                      tokenValid === true
                    }
                    className="rounded-l-only"
                    onChange={(event) => {
                      const { value } = event.target
                      setSelectedPreset(value)
                      clearError()
                      clearTestBanner()

                      const targPreset = availablePresets[Number(value)]

                      if (targPreset) {
                        setValue('name', targPreset.name)
                        setValue('hostname', targPreset.address)
                        setValue('port', targPreset.port.toString())
                        setValue('ssl', targPreset.ssl)
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
                    disabled={tokenValid !== true || updatePlexAuthPending}
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
                    {...register('name', {
                      onChange: clearServerSettingsFeedback,
                    })}
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
                    {...register('hostname', {
                      onChange: clearServerSettingsFeedback,
                    })}
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
                    {...register('port', {
                      onChange: clearServerSettingsFeedback,
                    })}
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
                    {...register('ssl', {
                      onChange: clearServerSettingsFeedback,
                    })}
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

            <div className="form-row">
              <label htmlFor="manual-token" className="text-label">
                Manual Token
                <span className="label-tip">
                  Paste a Plex token if you want to authenticate without the
                  Plex popup flow.
                </span>
              </label>
              <div className="form-input">
                <div className="form-input-field flex items-center gap-3">
                  <input
                    name="manual-token"
                    id="manual-token"
                    type="password"
                    className="flex-1"
                    value={manualToken}
                    onChange={(event) => {
                      clearError()
                      clearTestBanner()
                      setManualToken(event.target.value)
                    }}
                  ></input>
                  <span className="inline-flex rounded-md shadow-sm">
                    <SaveButton
                      type="button"
                      label="Save Token"
                      pendingLabel="Saving Token..."
                      disabled={
                        manualToken.trim() === '' || updatePlexAuthPending
                      }
                      isPending={updatePlexAuthPending}
                      onClick={() => {
                        void saveManualToken()
                      }}
                    />
                  </span>
                </div>
              </div>
            </div>

            <div className="actions mt-5 w-full">
              <div className="flex w-full flex-wrap sm:flex-nowrap">
                <span className="m-auto rounded-md shadow-sm sm:ml-3 sm:mr-auto">
                  <DocsButton page="Configuration/#plex" />
                </span>
                <div className="m-auto mt-3 flex xs:mt-0 sm:m-0 sm:justify-end">
                  <TestingButton
                    type="button"
                    buttonType="success"
                    onClick={performTest}
                    className="ml-3"
                    disabled={
                      testing ||
                      !hasStoredPlexCredentials ||
                      hasUnsavedServerChanges ||
                      updatePlexAuthPending
                    }
                    isPending={testing}
                    feedbackStatus={
                      testBanner.version ? testBanner.status : undefined
                    }
                    title={
                      updatePlexAuthPending
                        ? 'Wait for Plex authentication to finish before testing.'
                        : !hasStoredPlexCredentials
                          ? 'Authenticate with Plex before testing the connection.'
                          : hasUnsavedServerChanges
                            ? 'Save changes before testing the Plex connection.'
                            : undefined
                    }
                  />

                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <SaveButton
                      type="submit"
                      disabled={
                        !hasUnsavedServerChanges ||
                        isPending ||
                        updatePlexAuthPending ||
                        !hasStoredPlexCredentials
                      }
                      isPending={isPending}
                      title={
                        updatePlexAuthPending
                          ? 'Wait for Plex authentication to finish before saving.'
                          : !hasStoredPlexCredentials
                            ? 'Authenticate with Plex before saving server settings.'
                            : !hasUnsavedServerChanges
                              ? 'Change a Plex server setting before saving.'
                              : undefined
                      }
                    />
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
