import { zodResolver } from '@hookform/resolvers/zod'
import {
  BasicResponseDto,
  MetadataProviderPreference,
  tmdbSettingSchema,
  tvdbSettingSchema,
} from '@maintainerr/contracts'
import { type ReactNode, useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import {
  useMetadataProviderPreference,
  useUpdateMetadataProviderPreference,
} from '../../../api/settings'
import {
  getApiErrorMessage,
  normalizeConnectionErrorMessage,
} from '../../../utils/ApiError'
import GetApiHandler, {
  DeleteApiHandler,
  PostApiHandler,
} from '../../../utils/ApiHandler'
import Button from '../../Common/Button'
import SaveButton from '../../Common/SaveButton'
import TestingButton from '../../Common/TestingButton'
import { Input } from '../../Forms/Input'
import {
  type SettingsFeedback,
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'

interface ProviderConfig {
  key: 'tmdb' | 'tvdb'
  preference: MetadataProviderPreference
  title: string
  description: ReactNode
  emptyStateLabel: string
  helpText?: string
  testFailureMessage: string
  schema: typeof tmdbSettingSchema | typeof tvdbSettingSchema
}

interface ApiKeyFormResult {
  api_key: string
}

interface RefreshActionState {
  canRun: boolean
  label: string
}

function resolveMetadataPreference(
  preference: MetadataProviderPreference,
  tvdbCanBePrimary: boolean,
) {
  return preference === MetadataProviderPreference.TVDB_PRIMARY &&
    !tvdbCanBePrimary
    ? MetadataProviderPreference.TMDB_PRIMARY
    : preference
}

function useOptimisticMetadataPreference(
  resolvedPreference: MetadataProviderPreference,
) {
  const [pendingPreference, setPendingPreference] =
    useState<MetadataProviderPreference | null>(null)

  useEffect(() => {
    if (
      pendingPreference === null ||
      resolvedPreference !== pendingPreference
    ) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setPendingPreference((currentPreference) =>
        currentPreference === resolvedPreference ? null : currentPreference,
      )
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [pendingPreference, resolvedPreference])

  return {
    effectivePreference: pendingPreference ?? resolvedPreference,
    setPendingPreference,
  }
}

function getRefreshActionState({
  providerKey,
  refreshing,
  loadError,
  isLoading,
  isSubmitting,
  hasChanges,
  isConfigured,
}: {
  providerKey: ProviderConfig['key']
  refreshing: boolean
  loadError: boolean
  isLoading: boolean
  isSubmitting: boolean
  hasChanges: boolean
  isConfigured: boolean
}): RefreshActionState {
  if (refreshing) {
    return {
      canRun: false,
      label: 'Refreshing...',
    }
  }

  if (hasChanges) {
    return {
      canRun: false,
      label: 'Save to refresh',
    }
  }

  if (providerKey === 'tvdb' && !isConfigured) {
    return {
      canRun: false,
      label: 'Configure to refresh',
    }
  }

  return {
    canRun: !loadError && !isLoading && !isSubmitting,
    label: 'Refresh metadata',
  }
}

const providers: ProviderConfig[] = [
  {
    key: 'tmdb',
    preference: MetadataProviderPreference.TMDB_PRIMARY,
    title: 'TMDB',
    description: (
      <>
        You can create a free API key at{' '}
        <a
          href="https://www.themoviedb.org/settings/api"
          target="_blank"
          rel="noreferrer"
          className="text-maintainerr underline hover:text-maintainerr-400"
        >
          themoviedb.org
        </a>
        .
      </>
    ),
    emptyStateLabel: 'Built-in shared key',
    helpText: 'Leave empty to use the built-in shared key.',
    testFailureMessage: 'Failed to connect to TMDB. Verify the API key.',
    schema: tmdbSettingSchema,
  },
  {
    key: 'tvdb',
    preference: MetadataProviderPreference.TVDB_PRIMARY,
    title: 'TVDB',
    description: (
      <>
        You can create a free developer API key at{' '}
        <a
          href="https://thetvdb.com/dashboard/account/apikey"
          target="_blank"
          rel="noreferrer"
          className="text-maintainerr underline hover:text-maintainerr-400"
        >
          thetvdb.com
        </a>
        .
      </>
    ),
    emptyStateLabel: 'Not configured',
    testFailureMessage: 'Failed to connect to TVDB. Verify the API key.',
    schema: tvdbSettingSchema,
  },
]

function useProviderForm(config: ProviderConfig) {
  const [testStatus, setTestStatus] = useState<boolean | undefined>()
  const [testing, setTesting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const {
    feedback,
    clear,
    showError,
    showSuccess,
    showUpdated,
    showUpdateError,
  } = useSettingsFeedback(`${config.title} settings`)

  const {
    register,
    handleSubmit,
    reset,
    trigger,
    control,
    formState: { errors, isSubmitting, isLoading, defaultValues },
  } = useForm<ApiKeyFormResult>({
    resolver: zodResolver(config.schema),
    defaultValues: async () => {
      try {
        setLoadError(false)
        const response = await GetApiHandler<{ api_key: string }>(
          `/settings/${config.key}`,
        )

        return { api_key: response.api_key ?? '' }
      } catch {
        setLoadError(true)
        return { api_key: '' }
      }
    },
  })

  const apiKey = useWatch({ control, name: 'api_key' }) ?? ''
  const savedApiKey = defaultValues?.api_key ?? ''
  const hasChanges = apiKey !== savedApiKey
  const isGoingToRemove = apiKey === ''
  const isConfigured = savedApiKey !== ''
  const refreshAction = getRefreshActionState({
    providerKey: config.key,
    refreshing,
    loadError,
    isLoading,
    isSubmitting,
    hasChanges,
    isConfigured,
  })
  const canSave = !isSubmitting && !isLoading && !loadError

  const registerApiKey = register('api_key', {
    onChange: () => {
      clear()
      setTestStatus(undefined)
    },
  })

  const onSubmit = async (data: ApiKeyFormResult) => {
    clear()

    try {
      const response = await (data.api_key === ''
        ? DeleteApiHandler<BasicResponseDto>(`/settings/${config.key}`)
        : PostApiHandler<BasicResponseDto>(`/settings/${config.key}`, data))

      if (response.code) {
        reset({ api_key: data.api_key })
        if (data.api_key === '') {
          setTestStatus(undefined)
        }
        showUpdated()
      } else {
        showUpdateError()
      }
    } catch {
      showUpdateError()
    }
  }

  const performTest = async () => {
    if (testing || !(await trigger())) return

    clear()
    setTesting(true)

    await PostApiHandler<BasicResponseDto>(`/settings/test/${config.key}`, {
      api_key: apiKey,
    })
      .then((response) => {
        const message = normalizeConnectionErrorMessage(
          response.message,
          config.testFailureMessage,
        )

        if (response.code === 1) {
          setTestStatus(true)
          showSuccess(`Successfully connected to ${config.title}`)
        } else {
          setTestStatus(false)
          showError(message)
        }
      })
      .catch((error: unknown) => {
        setTestStatus(false)
        showError(getApiErrorMessage(error, config.testFailureMessage))
      })
      .finally(() => {
        setTesting(false)
      })
  }

  const performRefresh = async () => {
    if (!refreshAction.canRun) return

    clear()
    setRefreshing(true)

    await PostApiHandler<BasicResponseDto>(
      `/settings/metadata/refresh/${config.key}`,
      {},
    )
      .then((response) => {
        if (response.code === 1) {
          showSuccess(
            response.message ?? `${config.title} metadata refresh started`,
          )
        } else {
          showError(
            response.message ?? `Failed to refresh ${config.title} metadata`,
          )
        }
      })
      .catch(() => {
        showError(`Failed to refresh ${config.title} metadata`)
      })
      .finally(() => {
        setRefreshing(false)
      })
  }

  return {
    registerApiKey,
    handleSubmit,
    errors,
    isConfigured,
    isLoading,
    isSubmitting,
    testStatus,
    testing,
    refreshing,
    refreshAction,
    feedback,
    clearFeedback: clear,
    loadError,
    isGoingToRemove,
    canSave,
    onSubmit,
    performTest,
    performRefresh,
  }
}

function getProviderAlertFeedback(
  provider: ReturnType<typeof useProviderForm>,
  config: ProviderConfig,
): SettingsFeedback {
  if (provider.feedback) {
    return provider.feedback
  }

  if (provider.loadError) {
    return {
      type: 'warning',
      title: `Failed to load ${config.title} settings`,
    }
  }

  return null
}

function PrimarySwitch({
  id,
  label,
  checked,
  disabled,
  onToggle,
}: {
  id: string
  label: string
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onToggle}
      className={[
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200',
        checked ? 'bg-maintainerr-600' : 'bg-zinc-600',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 transform rounded-full bg-white transition duration-200',
          checked ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  )
}

function ProviderSection({
  config,
  isPrimary,
  canBePrimary,
  isPreferencePending,
  isConfigured,
  isLoading,
  isSubmitting,
  testStatus,
  isGoingToRemove,
  testing,
  refreshAction,
  loadError,
  registerApiKey,
  handleSubmit,
  errors,
  canSave,
  onSubmit,
  performTest,
  performRefresh,
  onTogglePrimary,
}: {
  config: ProviderConfig
  isPrimary: boolean
  canBePrimary: boolean
  isPreferencePending: boolean
  isConfigured: boolean
  isLoading: boolean
  isSubmitting: boolean
  testStatus?: boolean
  isGoingToRemove: boolean
  testing: boolean
  refreshAction: ReturnType<typeof useProviderForm>['refreshAction']
  loadError: boolean
  registerApiKey: ReturnType<typeof useProviderForm>['registerApiKey']
  handleSubmit: ReturnType<typeof useProviderForm>['handleSubmit']
  errors: ReturnType<typeof useProviderForm>['errors']
  canSave: ReturnType<typeof useProviderForm>['canSave']
  onSubmit: ReturnType<typeof useProviderForm>['onSubmit']
  performTest: ReturnType<typeof useProviderForm>['performTest']
  performRefresh: ReturnType<typeof useProviderForm>['performRefresh']
  onTogglePrimary: () => void
}) {
  const apiKeyStatus = isConfigured ? 'Configured' : config.emptyStateLabel

  return (
    <div className="flex h-full flex-col rounded-xl bg-zinc-800 px-4 pb-4 pt-5 text-zinc-400 shadow ring-1 ring-zinc-700">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="text-base font-medium text-white sm:text-lg">
            {config.title}
          </div>
          <Button
            buttonType="ghost"
            buttonSize="sm"
            type="button"
            onClick={() => void performRefresh()}
            disabled={!refreshAction.canRun}
          >
            <span className="font-semibold">{refreshAction.label}</span>
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-300">Primary</span>
          <PrimarySwitch
            id={`${config.key}-primary`}
            label={`${config.title} primary`}
            checked={isPrimary}
            disabled={isPreferencePending || isPrimary || !canBePrimary}
            onToggle={onTogglePrimary}
          />
        </div>
      </div>

      <form className="flex flex-1 flex-col" onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label
            htmlFor={`${config.key}-api-key`}
            className="block text-sm font-medium text-zinc-300"
          >
            API Key
          </label>
          <div className="mt-1">
            <Input
              id={`${config.key}-api-key`}
              type="password"
              {...registerApiKey}
              error={!!errors.api_key?.message}
            />
          </div>
          <div className="mt-2 min-h-5 text-xs text-zinc-500">
            {errors.api_key?.message ??
              config.helpText ??
              `API key ${apiKeyStatus.toLowerCase()}.`}
          </div>
          <div className="mt-2 text-xs leading-5 text-zinc-400">
            {config.description}
          </div>
        </div>

        <div className="mt-auto pt-4">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-end">
            <span className="inline-flex w-full rounded-md shadow-sm sm:w-auto">
              <TestingButton
                buttonType="success"
                className="h-10 w-full sm:w-auto"
                type="button"
                onClick={performTest}
                disabled={testing || isGoingToRemove || loadError || isLoading}
                label="Test Connection"
                isPending={testing}
                feedbackStatus={testStatus}
              />
            </span>
            <span className="inline-flex w-full rounded-md shadow-sm sm:w-auto">
              <SaveButton
                className="h-10 w-full sm:w-auto"
                type="submit"
                disabled={!canSave}
                isPending={isSubmitting}
              />
            </span>
          </div>
        </div>
      </form>
    </div>
  )
}

const MetadataSettings = () => {
  const { feedback, clear, showUpdated, showUpdateError, showWarning } =
    useSettingsFeedback('Metadata provider preference')
  const {
    data: preference = MetadataProviderPreference.TMDB_PRIMARY,
    isLoading: preferenceLoading,
  } = useMetadataProviderPreference()
  const tmdbProvider = useProviderForm(providers[0])
  const tvdbProvider = useProviderForm(providers[1])
  const { mutateAsync: savePreference, isPending: preferenceSaving } =
    useUpdateMetadataProviderPreference()

  const providerControllers = {
    tmdb: tmdbProvider,
    tvdb: tvdbProvider,
  }
  const pageFeedback =
    feedback ??
    getProviderAlertFeedback(tmdbProvider, providers[0]) ??
    getProviderAlertFeedback(tvdbProvider, providers[1])

  const tvdbCanBePrimary = tvdbProvider.isConfigured
  const resolvedPreference = resolveMetadataPreference(
    preference,
    tvdbCanBePrimary,
  )
  const { effectivePreference, setPendingPreference } =
    useOptimisticMetadataPreference(resolvedPreference)

  const clearAllFeedback = () => {
    clear()
    tmdbProvider.clearFeedback()
    tvdbProvider.clearFeedback()
  }

  const handlePreferenceChange = async (value: MetadataProviderPreference) => {
    if (
      value === effectivePreference ||
      preferenceLoading ||
      preferenceSaving
    ) {
      return
    }

    if (
      value === MetadataProviderPreference.TVDB_PRIMARY &&
      !tvdbCanBePrimary
    ) {
      clearAllFeedback()
      showWarning('TVDB must be configured before it can be primary')
      return
    }

    clearAllFeedback()
    setPendingPreference(value)

    try {
      await savePreference(value)
      showUpdated()
    } catch {
      setPendingPreference(null)
      showUpdateError()
    }
  }

  return (
    <>
      <title>Metadata settings - Maintainerr</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">Metadata Settings</h3>
          <p className="description">
            Configure metadata providers and set the primary source for posters,
            backdrops, and metadata enrichment. Adding a TVDB developer API key
            gives Maintainerr a fallback source for provider cross-references,
            which helps recover missing IDs when the primary provider cannot
            resolve a match and can provide a second opinion for some items
            through existing external ID cross-references.
          </p>
        </div>

        <div className="mt-4 max-w-6xl">
          <SettingsFeedbackAlert feedback={pageFeedback} />
        </div>

        <ul className="mt-4 grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-2">
          {providers.map((config) => {
            const provider = providerControllers[config.key]
            const clearProviderPageFeedback = () => {
              clearAllFeedback()
            }

            const registerApiKey = provider.registerApiKey
            const onSubmit = async (data: ApiKeyFormResult) => {
              clearProviderPageFeedback()
              await provider.onSubmit(data)
            }
            const performTest = async () => {
              clearProviderPageFeedback()
              await provider.performTest()
            }
            const performRefresh = async () => {
              clearProviderPageFeedback()
              await provider.performRefresh()
            }

            return (
              <li key={config.key} className="h-full">
                <ProviderSection
                  config={config}
                  isPrimary={effectivePreference === config.preference}
                  canBePrimary={
                    config.preference ===
                    MetadataProviderPreference.TMDB_PRIMARY
                      ? true
                      : tvdbCanBePrimary
                  }
                  isPreferencePending={preferenceLoading || preferenceSaving}
                  isConfigured={provider.isConfigured}
                  isLoading={provider.isLoading}
                  isSubmitting={provider.isSubmitting}
                  testStatus={provider.testStatus}
                  isGoingToRemove={provider.isGoingToRemove}
                  testing={provider.testing}
                  refreshAction={provider.refreshAction}
                  loadError={provider.loadError}
                  registerApiKey={{
                    ...registerApiKey,
                    onChange: (event) => {
                      clearProviderPageFeedback()
                      return registerApiKey.onChange(event)
                    },
                  }}
                  handleSubmit={provider.handleSubmit}
                  errors={provider.errors}
                  canSave={provider.canSave}
                  onSubmit={onSubmit}
                  performTest={performTest}
                  performRefresh={performRefresh}
                  onTogglePrimary={() => {
                    void handlePreferenceChange(config.preference)
                  }}
                />
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}

export default MetadataSettings
