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
          className="text-amber-500 underline hover:text-amber-400"
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
        You can create an API key at{' '}
        <a
          href="https://thetvdb.com/api-information/signup"
          target="_blank"
          rel="noreferrer"
          className="text-amber-500 underline hover:text-amber-400"
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
  const [testedSettings, setTestedSettings] = useState<
    { api_key: string } | undefined
  >()
  const [testing, setTesting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const { feedback, clear, showError, showInfo, showUpdated, showUpdateError } =
    useSettingsFeedback(`${config.title} settings`)

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
  const hasBeenTested = apiKey === testedSettings?.api_key
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
  const canSave =
    hasChanges &&
    (hasBeenTested || isGoingToRemove) &&
    !isSubmitting &&
    !isLoading &&
    !loadError

  const registerApiKey = register('api_key', {
    onChange: () => {
      clear()
      setTestedSettings(undefined)
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
        setTestedSettings(
          data.api_key === '' ? undefined : { api_key: data.api_key },
        )
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
          setTestedSettings({ api_key: apiKey })
          showInfo(`Successfully connected to ${config.title}`)
        } else {
          showError(message)
        }
      })
      .catch((error: unknown) => {
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
          showInfo(
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
    testing,
    refreshing,
    refreshAction,
    feedback,
    loadError,
    isGoingToRemove,
    canSave,
    onSubmit,
    performTest,
    performRefresh,
  }
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
        checked ? 'bg-amber-600' : 'bg-zinc-600',
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
  feedback,
  isConfigured,
  isLoading,
  isGoingToRemove,
  testing,
  refreshing,
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
  feedback: SettingsFeedback
  isConfigured: boolean
  isLoading: boolean
  isGoingToRemove: boolean
  testing: boolean
  refreshing: boolean
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
  const alertFeedback: SettingsFeedback =
    feedback ??
    (loadError
      ? {
          type: 'warning',
          title: `Failed to load ${config.title} settings`,
        }
      : null)

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

        <div className="mt-2.5">
          <SettingsFeedbackAlert feedback={alertFeedback} />
        </div>

        <div className="mt-auto w-full pt-2.5">
          <Button
            buttonSize="md"
            buttonType="twin-secondary-l"
            className="h-10 w-1/2"
            type="button"
            onClick={performTest}
            disabled={testing || isGoingToRemove || loadError || isLoading}
          >
            <span className="font-semibold">
              {testing ? 'Testing...' : 'Test'}
            </span>
          </Button>
          <Button
            buttonType="twin-primary-r"
            buttonSize="md"
            className="h-10 w-1/2"
            type="submit"
            disabled={!canSave}
          >
            <span className="font-semibold">Save</span>
          </Button>
        </div>
      </form>
    </div>
  )
}

const MetadataSettings = () => {
  const {
    data: preference = MetadataProviderPreference.TMDB_PRIMARY,
    isLoading: preferenceLoading,
  } = useMetadataProviderPreference()
  const tmdbProvider = useProviderForm(providers[0])
  const tvdbProvider = useProviderForm(providers[1])

  const { feedback, clear, showUpdated, showUpdateError, showWarning } =
    useSettingsFeedback('Metadata provider preference')
  const { mutateAsync: savePreference, isPending: preferenceSaving } =
    useUpdateMetadataProviderPreference()

  const providerControllers = {
    tmdb: tmdbProvider,
    tvdb: tvdbProvider,
  }

  const tvdbCanBePrimary = tvdbProvider.isConfigured
  const resolvedPreference = resolveMetadataPreference(
    preference,
    tvdbCanBePrimary,
  )
  const { effectivePreference, setPendingPreference } =
    useOptimisticMetadataPreference(resolvedPreference)

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
      showWarning('TVDB must be configured before it can be primary')
      return
    }

    clear()
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
            backdrops, and metadata enrichment.
          </p>
        </div>

        <div className="max-w-6xl">
          <div className="mt-4">
            <SettingsFeedbackAlert feedback={feedback} />
          </div>
        </div>

        <ul className="mt-4 grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-2">
          {providers.map((config) => {
            const provider = providerControllers[config.key]

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
                  feedback={provider.feedback}
                  isConfigured={provider.isConfigured}
                  isLoading={provider.isLoading}
                  isGoingToRemove={provider.isGoingToRemove}
                  testing={provider.testing}
                  refreshing={provider.refreshing}
                  refreshAction={provider.refreshAction}
                  loadError={provider.loadError}
                  registerApiKey={provider.registerApiKey}
                  handleSubmit={provider.handleSubmit}
                  errors={provider.errors}
                  canSave={provider.canSave}
                  onSubmit={provider.onSubmit}
                  performTest={provider.performTest}
                  performRefresh={provider.performRefresh}
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
