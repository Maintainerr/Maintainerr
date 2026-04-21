import { RefreshIcon } from '@heroicons/react/outline'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'
import axios from 'axios'
import { orderBy } from 'lodash-es'
import { useEffect, useMemo, useState } from 'react'
import { useSettingsOutletContext } from '..'
import {
  useDeletePlexAuth,
  usePatchSettings,
  usePlexAuthValidation,
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
import { Input } from '../../Forms/Input'
import { Select } from '../../Forms/Select'
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
  directIp: boolean
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

interface PlexAdvancedDraft {
  hostname: string
  port: string
  ssl: boolean
}

interface TokenValidationOverride {
  pending: boolean
  valid: boolean
}

const normalizePlexHostname = (hostname?: string) =>
  hostname?.replace('http://', '').replace('https://', '') ?? ''

const isDirectIpAddress = (address: string) => {
  if (address.includes(':')) return true

  const parts = address.split('.')
  if (parts.length !== 4) return false

  return parts.every(
    (part) =>
      part.length > 0 && part.length <= 3 && !Number.isNaN(Number(part)),
  )
}

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
  const { settings } = useSettingsOutletContext()
  const [tokenValidationOverride, setTokenValidationOverride] =
    useState<TokenValidationOverride>()
  const [clearTokenClicked, setClearTokenClicked] = useState<boolean>(false)
  const [selectedServerOverride, setSelectedServerOverride] = useState<
    SelectedServer | null | undefined
  >(undefined)
  const [manualModeOverride, setManualModeOverride] = useState<
    boolean | undefined
  >(undefined)
  const [advancedDraftOverride, setAdvancedDraftOverride] = useState<
    PlexAdvancedDraft | undefined
  >(undefined)
  const [testBanner, setTestbanner] = useState<{
    status: boolean
    version: string
  }>({ status: false, version: '' })
  const [testing, setTesting] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(
    () => settings?.plex_manual_mode === 1,
  )
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
  const hasStoredPlexToken = Boolean(settings?.plex_auth_token)
  const savedSelectedServer: SelectedServer | null =
    settings?.plex_name && settings?.plex_hostname && settings.plex_port != null
      ? {
          name: settings.plex_name,
          hostname: normalizePlexHostname(settings.plex_hostname),
          port: String(settings.plex_port),
          ssl: Boolean(settings.plex_ssl),
        }
      : null
  const savedAdvancedDraft: PlexAdvancedDraft = {
    hostname: normalizePlexHostname(settings?.plex_hostname) || '',
    port: settings?.plex_port != null ? String(settings.plex_port) : '32400',
    ssl: Boolean(settings?.plex_ssl),
  }
  const selectedServer =
    selectedServerOverride === undefined
      ? savedSelectedServer
      : selectedServerOverride
  const manualMode = manualModeOverride ?? settings?.plex_manual_mode === 1
  const advancedHostname =
    advancedDraftOverride?.hostname ?? savedAdvancedDraft.hostname
  const advancedPort = advancedDraftOverride?.port ?? savedAdvancedDraft.port
  const advancedSsl = advancedDraftOverride?.ssl ?? savedAdvancedDraft.ssl
  const storedAuthToken = settings?.plex_auth_token
  const {
    data: storedTokenValidation,
    isFetching: isStoredTokenValidationPending,
  } = usePlexAuthValidation({
    enabled: Boolean(storedAuthToken) && tokenValidationOverride == null,
  })
  const tokenValidationPending =
    tokenValidationOverride?.pending ??
    (hasStoredPlexToken ? isStoredTokenValidationPending : false)
  const tokenValid =
    tokenValidationOverride?.valid ??
    (hasStoredPlexToken ? storedTokenValidation?.valid === true : false)
  const storedTokenValidationError =
    tokenValidationOverride == null &&
    hasStoredPlexToken &&
    !tokenValidationPending &&
    storedTokenValidation?.valid === false
      ? storedTokenValidation.errorMessage
      : undefined
  const isAuthenticated = tokenValid

  useEffect(() => {
    if (!storedTokenValidationError) {
      return
    }

    // TanStack Query v5 removed query-level onError; route this back through
    // shared settings feedback so Plex follows the same inline feedback pattern.
    showError(storedTokenValidationError)
  }, [showError, storedTokenValidationError])

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

  // Track whether the user has edited the advanced fields since last save
  const hasUnsavedAdvancedChanges =
    manualMode &&
    (advancedHostname !== savedAdvancedDraft.hostname ||
      advancedPort !== savedAdvancedDraft.port ||
      advancedSsl !== savedAdvancedDraft.ssl)

  const clearTestBanner = () => {
    setTestbanner({ status: false, version: '' })
  }

  const submit = async () => {
    clearError()

    if (!isAuthenticated) {
      showWarning('Authenticate with Plex before saving server settings.')
      return
    }

    try {
      if (manualMode) {
        // Advanced settings: save manual override (no server selection required)
        const normalizedHostname =
          normalizePlexHostname(advancedHostname).trim()
        const port = Number(advancedPort.trim())

        if (!normalizedHostname) {
          showInfo('Please enter a hostname or IP address.')
          return
        }

        if (!Number.isInteger(port) || port <= 0 || port > 65535) {
          showInfo('Please enter a valid port.')
          return
        }

        await updateSettings({
          plex_hostname: advancedSsl
            ? `https://${normalizedHostname}`
            : normalizedHostname,
          plex_port: port,
          plex_name: selectedServer?.name || normalizedHostname,
          plex_ssl: Number(advancedSsl),
          plex_manual_mode: 1,
        })
      } else {
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

        await updateSettings({
          ...buildPlexServerPayload(selectedServer),
          plex_manual_mode: 0,
        })
      }

      setSelectedServerOverride(undefined)
      setManualModeOverride(undefined)
      setAdvancedDraftOverride(undefined)
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
          directIp: isDirectIpAddress(conn.address),
          status: conn.status == null ? true : conn.status === 200,
          latency: conn.latency,
        }),
      )
    })
    return orderBy(
      finalPresets,
      ['status', 'local', 'directIp', 'latency', 'ssl'],
      ['desc', 'desc', 'desc', 'asc', 'desc'],
    )
  }, [availableServers])

  const authsuccess = async (token: string) => {
    await persistToken(token)
  }

  const persistToken = async (token: string) => {
    clearError()
    clearTestBanner()
    setTokenValidationOverride({ pending: true, valid: false })

    const didPersistToken = await submitPlexToken({ plex_auth_token: token })

    if (!didPersistToken) {
      setTokenValidationOverride(undefined)
      return
    }

    const { valid, errorMessage } = await validateFreshToken(token)

    if (valid) {
      setSelectedServerOverride(undefined)
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
      setTokenValidationOverride(undefined)
      setClearTokenClicked(false)
      setSelectedServerOverride(null)
      setManualModeOverride(false)
      setAdvancedDraftOverride(undefined)
      clearTestBanner()
      showUpdated()
    } catch {
      showError('There was an error clearing Plex authentication.')
    }
  }

  const clientId = settings?.clientId
  const validateFreshToken = async (token: string) => {
    try {
      const response = await axios.get('https://plex.tv/api/v2/user', {
        headers: {
          'X-Plex-Product': 'Maintainerr',
          'X-Plex-Version': '2.0',
          'X-Plex-Client-Identifier': clientId ?? '',
          'X-Plex-Token': token,
        },
      })

      const valid = response.status === 200
      setTokenValidationOverride({ pending: false, valid })

      return valid
        ? { valid: true as const }
        : {
            valid: false as const,
            errorMessage:
              'Plex authentication could not be verified. Please try again.',
          }
    } catch (error) {
      setTokenValidationOverride({ pending: false, valid: false })
      return {
        valid: false as const,
        errorMessage: getApiErrorMessage(
          error,
          'Plex authentication could not be verified. Please try again.',
        ),
      }
    }
  }

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
          {feedback || testBanner.version || storedTokenValidationError ? (
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
                <label className="text-label">
                  Server
                  <span className="label-tip">
                    Ensure DNS is properly configured since Plex depends on
                    working DNS resolution
                  </span>
                </label>
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
                            setSelectedServerOverride(null)
                            setManualModeOverride(false)
                            setAdvancedDraftOverride(undefined)
                            setAdvancedOpen(false)
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
                      <div className="min-w-0 flex-1">
                        <Select
                          join="left"
                          defaultValue=""
                          disabled={isRefreshingPresets}
                          onChange={(e) => {
                            const preset =
                              availablePresets[Number(e.target.value)]
                            if (preset) {
                              setSelectedServerOverride({
                                name: preset.name,
                                hostname: preset.address,
                                port: String(preset.port),
                                ssl: preset.ssl,
                                local: preset.local,
                                latency: preset.latency,
                              })
                              setManualModeOverride(false)
                              setAdvancedDraftOverride(undefined)
                              setAdvancedOpen(false)
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
                        </Select>
                      </div>
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

            {/* Advanced Settings — hidden collapsible section */}
            {isAuthenticated && (
              <div className="mt-6">
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-white"
                  onClick={() => setAdvancedOpen((prev) => !prev)}
                >
                  {advancedOpen ? (
                    <ChevronUpIcon className="h-4 w-4" />
                  ) : (
                    <ChevronDownIcon className="h-4 w-4" />
                  )}
                  Advanced Settings
                  {manualMode && (
                    <span className="ml-1.5 inline-flex items-center rounded bg-amber-700 px-1.5 py-0.5 text-xs text-amber-200">
                      Manual
                    </span>
                  )}
                </button>

                {advancedOpen && (
                  <div className="mt-3 rounded-xl bg-zinc-800/50 p-4 ring-1 ring-zinc-700">
                    <div className="form-row">
                      <label
                        htmlFor="advanced-manual-mode"
                        className="text-label"
                      >
                        Manual connection override
                        <span className="label-tip">
                          Override the connection discovered by Plex.
                          <br />
                          Disables automatic reconnection — you manage the
                          connection.
                        </span>
                      </label>
                      <div className="form-input">
                        <div className="form-input-field">
                          <label className="inline-flex items-center gap-2">
                            <input
                              id="advanced-manual-mode"
                              name="advanced-manual-mode"
                              type="checkbox"
                              checked={manualMode}
                              onChange={(e) => {
                                setManualModeOverride(e.target.checked)
                                // When disabling manual mode while it's the saved state,
                                // clear server selection to force re-discovery from plex.tv
                                if (
                                  !e.target.checked &&
                                  settings?.plex_manual_mode === 1
                                ) {
                                  setSelectedServerOverride(null)
                                  clearTestBanner()
                                }
                              }}
                              className="rounded border-zinc-500 bg-zinc-700 text-amber-600 focus:ring-amber-500"
                            />
                            <span className="text-sm text-zinc-300">
                              Enable manual mode
                              <br />
                              <span className="text-xs text-zinc-500">
                                Plex authentication (above) is still required
                              </span>
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {manualMode && (
                      <>
                        <div className="form-row">
                          <label
                            htmlFor="advanced-hostname"
                            className="text-label"
                          >
                            Hostname / IP
                            <span className="label-tip">
                              e.g. plex, 192.168.1.50, or localhost
                            </span>
                          </label>
                          <div className="form-input">
                            <div className="form-input-field">
                              <Input
                                id="advanced-hostname"
                                name="advanced-hostname"
                                type="text"
                                value={advancedHostname}
                                onChange={(e) => {
                                  setAdvancedDraftOverride((currentDraft) => ({
                                    ...(currentDraft ?? savedAdvancedDraft),
                                    hostname: e.target.value,
                                  }))
                                }}
                                placeholder={
                                  normalizePlexHostname(
                                    settings?.plex_hostname,
                                  ) || 'plex'
                                }
                              />
                            </div>
                          </div>
                        </div>

                        <div className="form-row">
                          <label htmlFor="advanced-port" className="text-label">
                            Port
                          </label>
                          <div className="form-input">
                            <div className="form-input-field">
                              <Input
                                id="advanced-port"
                                name="advanced-port"
                                type="number"
                                value={advancedPort}
                                onChange={(e) => {
                                  setAdvancedDraftOverride((currentDraft) => ({
                                    ...(currentDraft ?? savedAdvancedDraft),
                                    port: e.target.value,
                                  }))
                                }}
                                placeholder="32400"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="form-row">
                          <label htmlFor="advanced-ssl" className="text-label">
                            TLS
                          </label>
                          <div className="form-input">
                            <div className="form-input-field">
                              <label className="inline-flex items-center gap-2">
                                <input
                                  id="advanced-ssl"
                                  name="advanced-ssl"
                                  type="checkbox"
                                  checked={advancedSsl}
                                  onChange={(e) => {
                                    setAdvancedDraftOverride(
                                      (currentDraft) => ({
                                        ...(currentDraft ?? savedAdvancedDraft),
                                        ssl: e.target.checked,
                                      }),
                                    )
                                  }}
                                  className="rounded border-zinc-500 bg-zinc-700 text-amber-600 focus:ring-amber-500"
                                />
                                <span className="text-sm text-zinc-300">
                                  Use HTTPS
                                </span>
                              </label>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
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
                      (!hasSelectedServer && !manualMode) ||
                      updatePlexAuthPending ||
                      testWouldTestWrongServer ||
                      hasUnsavedAdvancedChanges
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
                          : !hasSelectedServer && !manualMode
                            ? 'Select a Plex server before testing.'
                            : testWouldTestWrongServer ||
                                hasUnsavedAdvancedChanges
                              ? 'Save your settings before testing.'
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
