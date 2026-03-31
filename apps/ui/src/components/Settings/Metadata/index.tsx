import { SaveIcon } from '@heroicons/react/solid'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  BasicResponseDto,
  MetadataProviderPreference,
  tmdbSettingSchema,
  tvdbSettingSchema,
} from '@maintainerr/contracts'
import { type ReactNode, useState } from 'react'
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
import Alert from '../../Common/Alert'
import Button from '../../Common/Button'
import { InputGroup } from '../../Forms/Input'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'

interface ProviderConfig {
  key: 'tmdb' | 'tvdb'
  title: string
  description: ReactNode
  helpText?: string
  testFailureMessage: string
  schema: typeof tmdbSettingSchema | typeof tvdbSettingSchema
}

interface ApiKeyFormResult {
  api_key: string
}

const providers: ProviderConfig[] = [
  {
    key: 'tmdb',
    title: 'TMDB',
    description: (
      <>
        The Movie Database provides movie and TV metadata. You can create a free
        API key at{' '}
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
    helpText: 'Leave empty to use the built-in shared key.',
    testFailureMessage: 'Failed to connect to TMDB. Verify the API key.',
    schema: tmdbSettingSchema,
  },
  {
    key: 'tvdb',
    title: 'TVDB',
    description: (
      <>
        TheTVDB provides TV and movie metadata. You can create an API key at{' '}
        <a
          href="https://thetvdb.com/dashboard/account/apikey"
          target="_blank"
          rel="noreferrer"
          className="text-amber-500 underline hover:text-amber-400"
        >
          thetvdb.com
        </a>
        .
      </>
    ),
    testFailureMessage: 'Failed to connect to TVDB. Verify the API key.',
    schema: tvdbSettingSchema,
  },
]

interface TestStatus {
  status: boolean
  message: string
}

function useProviderForm(config: ProviderConfig) {
  const [testedSettings, setTestedSettings] = useState<
    { api_key: string } | undefined
  >()
  const [testing, setTesting] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [testResult, setTestResult] = useState<TestStatus>()
  const { feedback, showUpdated, showUpdateError, clearError } =
    useSettingsFeedback(`${config.title} settings`)

  const {
    register,
    handleSubmit,
    trigger,
    control,
    formState: { errors, isSubmitting, isLoading, defaultValues },
  } = useForm({
    resolver: zodResolver(config.schema),
    defaultValues: async () => {
      try {
        setLoadError(false)
        const resp = await GetApiHandler<{ api_key: string }>(
          `/settings/${config.key}`,
        )

        return { api_key: resp.api_key ?? '' }
      } catch {
        setLoadError(true)
        return { api_key: '' }
      }
    },
  })

  const apiKey = useWatch({ control, name: 'api_key' })

  const isGoingToRemove = apiKey === ''
  const sameAsSaved = apiKey === defaultValues?.api_key
  const hasBeenTested = apiKey === testedSettings?.api_key && testResult?.status
  const canSave =
    (sameAsSaved || hasBeenTested || isGoingToRemove) &&
    !isSubmitting &&
    !isLoading &&
    !loadError

  const onSubmit = async (data: ApiKeyFormResult) => {
    clearError()

    try {
      const resp = await (data.api_key === ''
        ? DeleteApiHandler<BasicResponseDto>(`/settings/${config.key}`)
        : PostApiHandler<BasicResponseDto>(`/settings/${config.key}`, data))

      if (resp.code) {
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

    setTesting(true)

    await PostApiHandler<BasicResponseDto>(`/settings/test/${config.key}`, {
      api_key: apiKey,
    })
      .then((resp) => {
        const message = normalizeConnectionErrorMessage(
          resp.message,
          config.testFailureMessage,
        )

        setTestResult({
          status: resp.code === 1,
          message,
        })

        if (resp.code === 1) {
          setTestedSettings({ api_key: apiKey })
        }
      })
      .catch((error: unknown) => {
        setTestResult({
          status: false,
          message: getApiErrorMessage(error, config.testFailureMessage),
        })
      })
      .finally(() => {
        setTesting(false)
      })
  }

  return {
    register,
    handleSubmit,
    errors,
    testing,
    testResult,
    feedback,
    loadError,
    isGoingToRemove,
    canSave,
    onSubmit,
    performTest,
  }
}

function ProviderSection({ config }: { config: ProviderConfig }) {
  const {
    register,
    handleSubmit,
    errors,
    testing,
    testResult,
    feedback,
    loadError,
    isGoingToRemove,
    canSave,
    onSubmit,
    performTest,
  } = useProviderForm(config)

  return (
    <>
      <SettingsFeedbackAlert feedback={feedback} />

      {loadError ? (
        <Alert
          type="warning"
          title={`Failed to load ${config.title} settings`}
        />
      ) : undefined}

      {testResult != null &&
        (testResult.status ? (
          <Alert
            type="info"
            title={`Successfully connected to ${config.title}`}
          />
        ) : (
          <Alert type="error" title={testResult.message} />
        ))}

      <div className="section">
        <h4 className="text-lg font-bold text-amber-500">{config.title}</h4>
        <p className="mt-1 text-sm text-zinc-400">{config.description}</p>

        <form onSubmit={handleSubmit(onSubmit)}>
          <InputGroup
            label="API Key"
            type="password"
            {...register('api_key')}
            error={errors.api_key?.message}
            helpText={config.helpText}
          />

          <div className="actions mt-5 w-full">
            <div className="flex w-full flex-wrap justify-end sm:flex-nowrap">
              <div className="m-auto mt-3 flex xs:mt-0 sm:m-0 sm:justify-end">
                <Button
                  buttonType="success"
                  type="button"
                  onClick={performTest}
                  className="ml-3"
                  disabled={testing || isGoingToRemove || loadError}
                >
                  {testing ? 'Testing Connection...' : 'Test Connection'}
                </Button>
                <span className="ml-3 inline-flex rounded-md shadow-sm">
                  <Button
                    buttonType="primary"
                    type="submit"
                    disabled={!canSave}
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
    </>
  )
}

const preferenceOptions: {
  value: MetadataProviderPreference
  label: string
}[] = [
  { value: MetadataProviderPreference.TMDB_PRIMARY, label: 'TMDB (default)' },
  { value: MetadataProviderPreference.TVDB_PRIMARY, label: 'TVDB' },
]

const MetadataSettings = () => {
  const {
    data: preference = MetadataProviderPreference.TMDB_PRIMARY,
    isLoading: preferenceLoading,
  } = useMetadataProviderPreference()

  const { feedback, showUpdated, showUpdateError, clearError } =
    useSettingsFeedback('Metadata settings')
  const { mutateAsync: savePreference, isPending: preferenceSaving } =
    useUpdateMetadataProviderPreference()

  const handlePreferenceChange = async (value: MetadataProviderPreference) => {
    clearError()

    try {
      await savePreference(value)
      showUpdated()
    } catch {
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
            Configure API keys for metadata providers and choose which provider
            is tried first for images and metadata enrichment.
          </p>
        </div>

        <SettingsFeedbackAlert feedback={feedback} />

        <div className="section">
          <h4 className="text-lg font-bold text-amber-500">
            Provider Preference
          </h4>
          <p className="mt-1 text-sm text-zinc-400">
            Choose which metadata provider is tried first for posters,
            backdrops, and media details. The other provider is still used as a
            fallback when possible.
          </p>

          <div className="mt-4">
            <label
              htmlFor="metadata-preference"
              className="block text-sm font-medium text-zinc-300"
            >
              Primary Provider
            </label>
            <select
              id="metadata-preference"
              className="mt-1 block w-full rounded-md border-zinc-600 bg-zinc-700 px-3 py-2 text-white shadow-sm focus:border-amber-500 focus:outline-none focus:ring-amber-500 sm:w-64"
              value={preference}
              disabled={preferenceLoading || preferenceSaving}
              onChange={(event) =>
                void handlePreferenceChange(
                  event.target.value as MetadataProviderPreference,
                )
              }
            >
              {preferenceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {providers.map((config) => (
          <ProviderSection key={config.key} config={config} />
        ))}
      </div>
    </>
  )
}

export default MetadataSettings
