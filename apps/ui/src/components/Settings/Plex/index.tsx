import { t as globalT } from '@lingui/core/macro'
import { serviceUrlSchema } from '@maintainerr/contracts'
import { useForm, useWatch } from 'react-hook-form'
import { ServiceUrlExamples } from '../../Forms/ServiceUrlExamples'
import { Trans, useLingui } from '@lingui/react/macro'
import { RefreshIcon } from '@heroicons/react/outline'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'
import axios from 'axios'
import { orderBy } from 'lodash-es'
import { useMemo, useState } from 'react'
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
import SaveButton from '../../Common/SaveButton'
import TestingButton from '../../Common/TestingButton'
import { CheckboxGroup } from '../../Forms/CheckboxGroup'
import FieldGroup from '../../Forms/FieldGroup'
import { InputGroup } from '../../Forms/Input'
import { Select } from '../../Forms/Select'
import PlexLoginButton from '../../Login/Plex'
import ServiceCard, { ServiceCardFooter } from '../ServiceCard'
import { useSettingsFeedback } from '../useSettingsFeedback'
import { releaseVersion } from '../../../utils/version'

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
  url: string
}

interface TokenValidationOverride {
  pending: boolean
  valid: boolean
}

const normalizePlexHostname = (hostname?: string) =>
  hostname?.replace('http://', '').replace('https://', '') ?? ''

const plexConnectionUrlSchema = serviceUrlSchema.refine((value) => {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return (
    url.pathname === '/' &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password
  )
})

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
  const { t } = useLingui()
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
  const [testBanner, setTestBanner] = useState<{
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
    clear,
  } = useSettingsFeedback({
    updated: t`Saved`,
    updateError: t`Plex settings could not be updated`,
  })

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
    url: settings?.plex_hostname
      ? `${settings.plex_ssl ? 'https' : 'http'}://${normalizePlexHostname(settings.plex_hostname)}:${settings.plex_port ?? 32400}`
      : '',
  }
  const {
    register: registerAdvanced,
    control: advancedControl,
    reset: resetAdvanced,
    setError: setAdvancedError,
    clearErrors: clearAdvancedErrors,
    formState: { errors: advancedErrors },
  } = useForm<PlexAdvancedDraft>({ values: savedAdvancedDraft })

  const selectedServer =
    selectedServerOverride === undefined
      ? savedSelectedServer
      : selectedServerOverride
  const manualMode = manualModeOverride ?? settings?.plex_manual_mode === 1
  const advancedUrl = useWatch({ control: advancedControl, name: 'url' }) ?? ''

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
  const showStoredValidationResult =
    tokenValidationOverride == null &&
    hasStoredPlexToken &&
    !tokenValidationPending &&
    storedTokenValidation?.valid === false
  // plex.tv couldn't be reached: the saved token may be fine, so stay
  // authenticated and warn (the query keeps retrying) instead of demanding
  // re-authentication.
  const tokenUnreachable =
    showStoredValidationResult && storedTokenValidation?.unreachable === true
  const storedTokenValidationAlert = showStoredValidationResult
    ? {
        type: tokenUnreachable ? ('warning' as const) : ('error' as const),
        title:
          storedTokenValidation?.errorMessage ??
          (tokenUnreachable
            ? t`Couldn't reach ${{ plexTv: 'plex.tv' }} to verify your credentials - retrying. Your saved token is still in use.`
            : t`Stored Plex credentials are invalid. Re-authenticate with Plex.`),
      }
    : null
  const isAuthenticated = tokenValid || tokenUnreachable

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
    manualMode && advancedUrl !== savedAdvancedDraft.url

  const clearTestBanner = () => {
    setTestBanner({ status: false, version: '' })
  }

  const submit = async () => {
    clear()

    if (!isAuthenticated) {
      showWarning(t`Authenticate with Plex before saving server settings.`)
      return
    }

    try {
      if (manualMode) {
        // Collapsing Advanced unmounts the URL field, and react-hook-form does
        // not validate unmounted fields, so the value is checked directly.
        if (!plexConnectionUrlSchema.safeParse(advancedUrl).success) {
          setAdvancedOpen(true)
          setAdvancedError('url', {
            type: 'manual',
            message: globalT`Please enter a valid server URL with no path.`,
          })
          return
        }
        clearAdvancedErrors('url')
        const url = new URL(advancedUrl.trim())
        const ssl = url.protocol === 'https:'
        const port = Number(url.port || (ssl ? 443 : 80))
        const normalizedHostname = url.hostname

        await updateSettings({
          plex_hostname: ssl
            ? `https://${normalizedHostname}`
            : normalizedHostname,
          plex_port: port,
          plex_name: selectedServer?.name || normalizedHostname,
          plex_ssl: Number(ssl),
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
            t`Please complete server setup by selecting a server from the dropdown.`,
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
      resetAdvanced(savedAdvancedDraft)
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
        showError(t`There was an error updating Plex authentication.`)
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
    clear()
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
    clear()

    try {
      await deletePlexAuth()
      setTokenValidationOverride(undefined)
      setClearTokenClicked(false)
      setSelectedServerOverride(null)
      setManualModeOverride(false)
      resetAdvanced(savedAdvancedDraft)
      clearTestBanner()
      showUpdated()
    } catch {
      showError(t`There was an error clearing Plex authentication.`)
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
            errorMessage: t`Plex authentication could not be verified. Please try again.`,
          }
    } catch (error) {
      setTokenValidationOverride({ pending: false, valid: false })
      return {
        valid: false as const,
        errorMessage: getApiErrorMessage(
          error,
          t`Plex authentication could not be verified. Please try again.`,
        ),
      }
    }
  }

  const performTest = async () => {
    if (testing) return

    // The status shows whatever happened last, so a new test hides "Saved".
    clear()

    if (updatePlexAuthPending) {
      showWarning(t`Wait for Plex authentication to finish before testing.`)
      return
    }

    if (!isAuthenticated) {
      showWarning(t`Authenticate with Plex before testing the connection.`)
      return
    }

    setTesting(true)

    try {
      const result = await GetApiHandler<{
        status: 'OK' | 'NOK'
        code: 0 | 1
        message: string
      }>('/settings/test/plex')

      setTestBanner({
        status: result.code === 1,
        version: normalizeConnectionErrorMessage(
          result.message,
          t`Failed to connect to Plex. Verify your Plex configuration.`,
        ),
      })
    } catch (error) {
      setTestBanner({
        status: false,
        version: getApiErrorMessage(
          error,
          t`Failed to connect to Plex. Verify your Plex configuration.`,
        ),
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <title>{t`Plex settings - Maintainerr`}</title>
      <div className="max-w-6xl">
        <ServiceCard title="Plex">
          <div className="flex flex-1 flex-col gap-3">
            {!isAuthenticated &&
            !(tokenValidationPending && hasStoredPlexToken) ? (
              <Alert
                type="info"
                title={t`Plex configuration is required. Authenticate with Plex to get started.`}
              />
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FieldGroup
                layout="stacked"
                label={t`Authentication`}
                helpText={
                  <Trans>
                    Authentication with the server&apos;s admin account is
                    required to access the Plex API
                  </Trans>
                }
              >
                {tokenValidationPending ? (
                  <Button type="button" buttonType="default" disabled>
                    <Trans>Checking authentication...</Trans>
                  </Button>
                ) : isAuthenticated ? (
                  clearTokenClicked ? (
                    <Button
                      type="button"
                      onClick={deleteToken}
                      buttonType="warning"
                      disabled={deletePlexAuthPending}
                    >
                      <Trans>Clear credentials?</Trans>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => setClearTokenClicked(true)}
                      buttonType="success"
                    >
                      <Trans>Authenticated</Trans>
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
              </FieldGroup>

              {isAuthenticated ? (
                <FieldGroup
                  layout="stacked"
                  // Only the dropdown is a control the label can name.
                  id={selectedServer ? undefined : 'plex-server'}
                  label={t`Server`}
                  helpText={
                    <Trans>
                      Ensure DNS is properly configured since Plex depends on
                      working DNS resolution
                    </Trans>
                  }
                >
                  {selectedServer ? (
                    <div className="flex items-center justify-between gap-4 rounded-md px-3 py-2 ring-1 ring-zinc-700">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">
                          {selectedServer.name}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-zinc-400">
                          <span>
                            {selectedServer.hostname}:{selectedServer.port}
                          </span>
                          {selectedServer.ssl && (
                            <span className="inline-flex items-center rounded-sm bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">
                              SSL/TLS
                            </span>
                          )}
                          {selectedServer.local !== undefined && (
                            <span className="inline-flex items-center rounded-sm bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">
                              {selectedServer.local ? (
                                <Trans>Local</Trans>
                              ) : (
                                <Trans>Remote</Trans>
                              )}
                            </span>
                          )}
                          {selectedServer.latency !== undefined && (
                            <span className="inline-flex items-center rounded-sm bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">
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
                          resetAdvanced(savedAdvancedDraft)
                          setAdvancedOpen(false)
                          clear()
                          clearTestBanner()
                        }}
                      >
                        <Trans>Change</Trans>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex">
                      <div className="min-w-0 flex-1">
                        <Select
                          id="plex-server"
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
                              resetAdvanced(savedAdvancedDraft)
                              setAdvancedOpen(false)
                              clear()
                              clearTestBanner()
                            }
                          }}
                        >
                          <option value="" disabled>
                            {isRefreshingPresets
                              ? t`Retrieving servers...`
                              : isServersError
                                ? t`Failed to load servers - press refresh to retry`
                                : !availableServers
                                  ? t`Loading servers...`
                                  : t`Select a server...`}
                          </option>
                          {availablePresets.map((server, index) => (
                            <option
                              key={`preset-${index}`}
                              value={index}
                              disabled={!server.status}
                            >
                              {server.name} ({server.address}:{server.port}) [
                              {server.local ? t`local` : t`remote`}]
                              {server.ssl ? ` [${t`secure`}]` : ''}
                              {!server.status ? ` (${t`unavailable`})` : ''}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <button
                        type="button"
                        onClick={() => void refetchServers()}
                        disabled={!isAuthenticated || updatePlexAuthPending}
                        className="input-action"
                        aria-label={t`Refresh servers`}
                      >
                        <RefreshIcon
                          className={isRefreshingPresets ? 'animate-spin' : ''}
                          style={{ animationDirection: 'reverse' }}
                        />
                      </button>
                    </div>
                  )}
                </FieldGroup>
              ) : null}
            </div>

            {/* Advanced settings: a collapsed manual connection override */}
            {isAuthenticated && (
              <div>
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-white"
                  aria-expanded={advancedOpen}
                  onClick={() => setAdvancedOpen((prev) => !prev)}
                >
                  {advancedOpen ? (
                    <ChevronUpIcon className="h-4 w-4" />
                  ) : (
                    <ChevronDownIcon className="h-4 w-4" />
                  )}
                  <Trans>Advanced Settings</Trans>
                  {manualMode && (
                    <span className="ml-1.5 inline-flex items-center rounded-sm bg-maintainerr-600 px-1.5 py-0.5 text-xs text-white">
                      <Trans>Manual</Trans>
                    </span>
                  )}
                </button>

                {advancedOpen && (
                  <div className="mt-3 flex flex-col gap-3">
                    <InputGroup
                      layout="stacked"
                      id="advanced-url"
                      label="URL"
                      type="text"
                      disabled={!manualMode}
                      placeholder="http://localhost:32400"
                      helpText={
                        <ServiceUrlExamples
                          examples={[
                            'http://localhost:32400',
                            'https://plex.example.com',
                          ]}
                        />
                      }
                      error={advancedErrors.url?.message}
                      {...registerAdvanced('url')}
                    />
                    <CheckboxGroup
                      id="advanced-manual-mode"
                      label={t`Enable manual mode`}
                      helpText={
                        <Trans>
                          Override the connection discovered by Plex.
                          <br />
                          Disables automatic reconnection - you manage the
                          connection.
                        </Trans>
                      }
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
                    />
                  </div>
                )}
              </div>
            )}

            <ServiceCardFooter
              status={
                feedback ??
                (testBanner.version
                  ? {
                      type: testBanner.status ? 'success' : 'error',
                      title: testBanner.status
                        ? t`Success! (${{ version: releaseVersion(testBanner.version) }})`
                        : testBanner.version,
                    }
                  : null) ??
                storedTokenValidationAlert ??
                null
              }
            >
              <TestingButton
                type="button"
                buttonType="success"
                onClick={performTest}
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
                    ? t`Wait for Plex authentication to finish before testing.`
                    : !isAuthenticated
                      ? t`Authenticate with Plex before testing the connection.`
                      : !hasSelectedServer && !manualMode
                        ? t`Select a Plex server before testing.`
                        : testWouldTestWrongServer || hasUnsavedAdvancedChanges
                          ? t`Save your settings before testing.`
                          : undefined
                }
              />
              <SaveButton
                type="button"
                onClick={() => void submit()}
                disabled={
                  isPending || updatePlexAuthPending || !isAuthenticated
                }
                isPending={isPending}
                title={
                  updatePlexAuthPending
                    ? t`Wait for Plex authentication to finish before saving.`
                    : !isAuthenticated
                      ? t`Authenticate with Plex before saving server settings.`
                      : undefined
                }
              />
            </ServiceCardFooter>
          </div>
        </ServiceCard>
      </div>
    </>
  )
}

export default PlexSettings
