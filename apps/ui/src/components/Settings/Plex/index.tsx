import { RefreshIcon } from '@heroicons/react/outline'
import axios from 'axios'
import { orderBy } from 'lodash-es'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSettingsOutletContext } from '..'
import {
  useDeletePlexAuth,
  usePatchSettings,
  usePlexServers,
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
import { useSettingsFeedback } from '../useSettingsFeedback'

interface PresetServerDisplay {
  name: string
  ssl: boolean
  uri: string
  address: string
  port: number
  local: boolean
  status?: boolean
  latency?: number
}

export interface PlexServerFormState {
  hostname: string
  port: string
  name: string
  ssl: boolean
}

interface SelectedServer {
  name: string
  hostname: string
  port: string
  ssl: boolean
  local?: boolean
  latency?: number
}

const normalizePlexHostname = (hostname?: string) =>
  hostname?.replace('http://', '').replace('https://', '') ?? ''

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
  const [tokenValidationPending, setTokenValidationPending] =
    useState<boolean>(false)
  const [clearTokenClicked, setClearTokenClicked] = useState<boolean>(false)
  const [selectedServer, setSelectedServer] = useState<SelectedServer | null>(
    null,
  )
  const [testBanner, setTestbanner] = useState<{
    status: boolean
    version: string
  }>({ status: false, version: '' })
  const [testing, setTesting] = useState(false)
  const {
    feedback,
    showInfo,
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
  const hasStoredPlexToken = Boolean(settings?.plex_auth_token)
  const isAuthenticated = tokenValid

  const {
    data: availableServers,
    isFetching: isRefreshingPresets,
    isError: isServersError,
    refetch: refetchServers,
  } = usePlexServers({
    enabled: isAuthenticated && selectedServer === null,
  })

  const savedServer: PlexServerFormState = {
    hostname: normalizePlexHostname(settings?.plex_hostname),
    port: settings?.plex_port != null ? String(settings.plex_port) : '',
    name: settings?.plex_name ?? '',
    ssl: Boolean(settings?.plex_ssl),
  }
  const testWouldTestWrongServer =
    selectedServer != null &&
    hasUnsavedPlexServerChanges(selectedServer, savedServer)
  const hasSelectedServer = selectedServer != null

  useEffect(() => {
    if (
      settings?.plex_name &&
      settings?.plex_hostname &&
      settings?.plex_port != null
    ) {
      setSelectedServer({
        name: settings.plex_name,
        hostname: normalizePlexHostname(settings.plex_hostname),
        port: String(settings.plex_port),
        ssl: Boolean(settings.plex_ssl),
      })
    }
  }, [
    settings?.plex_hostname,
    settings?.plex_name,
    settings?.plex_port,
    settings?.plex_ssl,
  ])

  const clearTestBanner = useCallback(() => {
    setTestbanner({ status: false, version: '' })
  }, [])

  const submit = async () => {
    clearError()

    if (!isAuthenticated) {
      showWarning('Authenticate with Plex before saving server settings.')
      return
    }

    if (
      !selectedServer ||
      selectedServer.hostname === '' ||
      selectedServer.port === '' ||
      selectedServer.name === ''
    ) {
      showInfo(
        'Please complete server setup by selecting a server from the dropdown.',
      )
      return
    }

    try {
      await updateSettings(buildPlexServerPayload(selectedServer))
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
          status: conn.status == null ? true : conn.status === 200,
          latency: conn.latency,
        }),
      )
    })
    return orderBy(
      finalPresets,
      ['status', 'local', 'latency', 'ssl'],
      ['desc', 'desc', 'asc', 'desc'],
    )
  }, [availableServers])

  const authsuccess = async (token: string) => {
    await persistToken(token)
  }

  const persistToken = async (token: string) => {
    clearError()
    clearTestBanner()
    setTokenValid(false)

    const didPersistToken = await submitPlexToken({ plex_auth_token: token })

    if (!didPersistToken) {
      return
    }

    const { valid, errorMessage } = await verifyToken(token)

    if (valid) {
      showUpdated()
      return
    }

    if (errorMessage) {
      showError(errorMessage)
    }
  }

  const authFailed = (message: string) => {
    showError(message)
  }

  const deleteToken = async () => {
    clearError()

    try {
      await deletePlexAuth()
      setTokenValid(false)
      setTokenValidationPending(false)
      setClearTokenClicked(false)
      setSelectedServer(null)
      clearTestBanner()
      showUpdated()
    } catch {
      showError('There was an error clearing Plex authentication.')
    }
  }

  const verifyToken = useCallback(
    async (token?: string) => {
      setTokenValidationPending(true)

      try {
        if (token) {
          // Fresh token from Plex OAuth — verify directly with plex.tv
          const response = await axios.get('https://plex.tv/api/v2/user', {
            headers: {
              'X-Plex-Product': 'Maintainerr',
              'X-Plex-Version': '2.0',
              'X-Plex-Client-Identifier': settings?.clientId ?? '',
              'X-Plex-Token': token,
            },
          })

          const valid = response.status === 200
          setTokenValid(valid)

          return valid
            ? { valid: true as const }
            : {
                valid: false as const,
                errorMessage:
                  'Plex authentication could not be verified. Please try again.',
              }
        }

        if (settings?.plex_auth_token) {
          // Existing token (masked in settings) — verify via server-side auth endpoint
          const result = await GetApiHandler<{
            status: string
            code: number
            message: string
          }>('/settings/test/plex/auth')

          const valid = result.status === 'OK'
          setTokenValid(valid)

          return valid
            ? { valid: true as const }
            : {
                valid: false as const,
                errorMessage:
                  result.message ||
                  'Stored Plex credentials are invalid. Re-authenticate with Plex.',
              }
        }

        setTokenValid(false)
        return {
          valid: false as const,
          errorMessage: 'Authenticate with Plex to continue.',
        }
      } catch (error) {
        setTokenValid(false)
        return {
          valid: false as const,
          errorMessage: getApiErrorMessage(
            error,
            token
              ? 'Plex authentication could not be verified. Please try again.'
              : 'Stored Plex credentials could not be validated. Re-authenticate with Plex.',
          ),
        }
      } finally {
        setTokenValidationPending(false)
      }
    },
    [settings?.clientId, settings?.plex_auth_token],
  )

  useEffect(() => {
    let cancelled = false

    if (!settings?.plex_auth_token) {
      setTokenValid(false)
      setTokenValidationPending(false)
      return
    }

    void verifyToken().then((result) => {
      if (!cancelled && !result.valid && result.errorMessage) {
        showError(result.errorMessage)
      }
    })

    return () => {
      cancelled = true
    }
  }, [settings?.plex_auth_token, showError, verifyToken])

  const performTest = async () => {
    if (testing) return

    if (updatePlexAuthPending) {
      showWarning('Wait for Plex authentication to finish before testing.')
      return
    }

    if (!isAuthenticated) {
      showWarning('Authenticate with Plex before testing the connection.')
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

  return (
    <>
      <title>Plex settings - Maintainerr</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">Plex Settings</h3>
          <p className="description">Plex configuration</p>
        </div>

        {tokenValidationPending && hasStoredPlexToken ? (
          <Alert type="info" title="Validating stored Plex authentication..." />
        ) : !isAuthenticated ? (
          <Alert
            type="info"
            title="Plex configuration is required. Authenticate with Plex to get started."
          />
        ) : null}

        <SettingsAlertSlot>
          {feedback || testBanner.version ? (
            <div className="space-y-4">
              {feedback ? (
                <Alert type={feedback.type} title={feedback.title} />
              ) : null}
              {testBanner.version ? (
                testBanner.status ? (
                  <Alert
                    type="success"
                    title={`Successfully connected to Plex (${testBanner.version})`}
                  />
                ) : (
                  <Alert type="error" title={testBanner.version} />
                )
              ) : null}
            </div>
          ) : null}
        </SettingsAlertSlot>

        <div className="section">
          <div>
            {/* Authentication */}
            <div className="form-row">
              <label className="text-label">
                Authentication
                <span className="label-tip">
                  {`Authentication with the server's admin account is required to access the Plex API`}
                </span>
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  {tokenValidationPending ? (
                    <Button type="button" buttonType="default" disabled>
                      Checking authentication...
                    </Button>
                  ) : tokenValid ? (
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
                        onClick={() => setClearTokenClicked(true)}
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
                      clientIdentifier={settings?.clientId ?? ''}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Server — only shown when authenticated */}
            {isAuthenticated && (
              <div className="form-row">
                <label className="text-label">Server</label>
                <div className="form-input">
                  {selectedServer ? (
                    <div className="max-w-xl rounded-xl bg-zinc-800 p-4 ring-1 ring-zinc-700">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">
                            {selectedServer.name}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-zinc-400">
                            <span>
                              {selectedServer.hostname}:{selectedServer.port}
                            </span>
                            {selectedServer.ssl && (
                              <span className="inline-flex items-center rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">
                                SSL/TLS
                              </span>
                            )}
                            {selectedServer.local !== undefined && (
                              <span className="inline-flex items-center rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">
                                {selectedServer.local ? 'Local' : 'Remote'}
                              </span>
                            )}
                            {selectedServer.latency !== undefined && (
                              <span className="inline-flex items-center rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">
                                {selectedServer.latency}ms
                              </span>
                            )}
                          </p>
                        </div>
                        <Button
                          type="button"
                          buttonType="default"
                          onClick={() => {
                            setSelectedServer(null)
                            clearError()
                            clearTestBanner()
                          }}
                        >
                          Change
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="form-input-field">
                      <select
                        className="rounded-l-only"
                        defaultValue=""
                        disabled={isRefreshingPresets}
                        onChange={(e) => {
                          const preset =
                            availablePresets[Number(e.target.value)]
                          if (preset) {
                            setSelectedServer({
                              name: preset.name,
                              hostname: preset.address,
                              port: String(preset.port),
                              ssl: preset.ssl,
                              local: preset.local,
                              latency: preset.latency,
                            })
                            clearError()
                            clearTestBanner()
                          }
                        }}
                      >
                        <option value="" disabled>
                          {isRefreshingPresets
                            ? 'Retrieving servers...'
                            : isServersError
                              ? 'Failed to load servers — press refresh to retry'
                              : !availableServers
                                ? 'Loading servers...'
                                : 'Select a server...'}
                        </option>
                        {availablePresets.map((server, index) => (
                          <option
                            key={`preset-${index}`}
                            value={index}
                            disabled={!server.status}
                          >
                            {server.name} ({server.address}:{server.port}) [
                            {server.local ? 'local' : 'remote'}]
                            {server.ssl ? ' [secure]' : ''}
                            {!server.status ? ' (unavailable)' : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void refetchServers()}
                        disabled={tokenValid !== true || updatePlexAuthPending}
                        className="input-action"
                      >
                        <RefreshIcon
                          className={isRefreshingPresets ? 'animate-spin' : ''}
                          style={{ animationDirection: 'reverse' }}
                        />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

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
                      !isAuthenticated ||
                      !hasSelectedServer ||
                      updatePlexAuthPending ||
                      testWouldTestWrongServer
                    }
                    isPending={testing}
                    feedbackStatus={
                      testBanner.version ? testBanner.status : undefined
                    }
                    title={
                      updatePlexAuthPending
                        ? 'Wait for Plex authentication to finish before testing.'
                        : !isAuthenticated
                          ? 'Authenticate with Plex before testing the connection.'
                          : !hasSelectedServer
                            ? 'Select a Plex server before testing.'
                            : testWouldTestWrongServer
                              ? 'Save your server selection before testing.'
                              : undefined
                    }
                  />
                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <SaveButton
                      type="button"
                      onClick={() => void submit()}
                      disabled={
                        isPending || updatePlexAuthPending || !isAuthenticated
                      }
                      isPending={isPending}
                      title={
                        updatePlexAuthPending
                          ? 'Wait for Plex authentication to finish before saving.'
                          : !isAuthenticated
                            ? 'Authenticate with Plex before saving server settings.'
                            : undefined
                      }
                    />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
export default PlexSettings
