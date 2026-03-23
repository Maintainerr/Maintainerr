import { SaveIcon } from '@heroicons/react/solid'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  BasicResponseDto,
  MetadataProviderPreference,
  tmdbSettingFormSchema,
  type TmdbSettingForm,
} from '@maintainerr/contracts'
import { ReactNode, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import {
  useMetadataProviderPreference,
  useUpdateMetadataProviderPreference,
} from '../../../api/settings'
import GetApiHandler, {
  DeleteApiHandler,
  PostApiHandler,
} from '../../../utils/ApiHandler'
import Alert from '../../Common/Alert'
import Button from '../../Common/Button'
import { InputGroup } from '../../Forms/Input'

// ───── Provider config ─────

interface ProviderConfig {
  key: string
  title: string
  description: ReactNode
  helpText?: string
}

const providers: ProviderConfig[] = [
  {
    key: 'tmdb',
    title: 'TMDB',
    description: (
      <>
        The Movie Database (TMDB) is used for fetching movie and TV show
        metadata. You can obtain a free API key at{' '}
        <a
          href="https://www.themoviedb.org/settings/api"
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-500 underline hover:text-amber-400"
        >
          themoviedb.org
        </a>
        .
      </>
    ),
    helpText: 'Leave empty to use the default shared key',
  },
  {
    key: 'tvdb',
    title: 'TVDB',
    description: (
      <>
        TheTVDB provides TV show and movie metadata. You can obtain an API key
        at{' '}
        <a
          href="https://thetvdb.com/dashboard/account/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-500 underline hover:text-amber-400"
        >
          thetvdb.com
        </a>
        .
      </>
    ),
  },
]

// ───── Reusable provider form hook ─────

const apiKeyFormSchema = tmdbSettingFormSchema

type ApiKeyFormResult = TmdbSettingForm

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
  const [submitError, setSubmitError] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    trigger,
    control,
    formState: { errors, isSubmitting, isLoading, defaultValues },
  } = useForm<ApiKeyFormResult, any, ApiKeyFormResult>({
    resolver: zodResolver(apiKeyFormSchema),
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
    setSubmitError(false)
    setSubmitSuccess(false)

    try {
      const resp = await (data.api_key === ''
        ? DeleteApiHandler<BasicResponseDto>(`/settings/${config.key}`)
        : PostApiHandler<BasicResponseDto>(`/settings/${config.key}`, data))

      if (resp.code) {
        setSubmitSuccess(true)
      } else {
        setSubmitError(true)
      }
    } catch {
      setSubmitError(true)
    }
  }

  const performTest = async () => {
    if (testing || !(await trigger())) return

    setTesting(true)

    await PostApiHandler<BasicResponseDto>(`/settings/test/${config.key}`, {
      api_key: apiKey,
    })
      .then((resp) => {
        setTestResult({
          status: resp.code === 1,
          message: resp.message ?? 'Unknown error',
        })
        if (resp.code === 1) {
          setTestedSettings({ api_key: apiKey })
        }
      })
      .catch(() => {
        setTestResult({ status: false, message: 'Unknown error' })
      })
      .finally(() => {
        setTesting(false)
      })
  }

  return {
    register,
    handleSubmit,
    errors,
    apiKey,
    testing,
    testResult,
    submitError,
    submitSuccess,
    loadError,
    isGoingToRemove,
    canSave,
    onSubmit,
    performTest,
  }
}

// ───── Provider section component ─────

function ProviderSection({ config }: { config: ProviderConfig }) {
  const {
    register,
    handleSubmit,
    errors,
    testing,
    testResult,
    submitError,
    submitSuccess,
    loadError,
    isGoingToRemove,
    canSave,
    onSubmit,
    performTest,
  } = useProviderForm(config)

  return (
    <>
      {submitError ? (
        <Alert type="warning" title="Something went wrong" />
      ) : submitSuccess ? (
        <Alert
          type="info"
          title={`${config.title} settings successfully updated`}
        />
      ) : undefined}

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
                  {testing ? 'Testing...' : 'Test'}
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

// ───── Preference options ─────

const preferenceOptions: {
  value: MetadataProviderPreference
  label: string
}[] = [
  { value: MetadataProviderPreference.TMDB_PRIMARY, label: 'TMDB (default)' },
  { value: MetadataProviderPreference.TVDB_PRIMARY, label: 'TVDB' },
]

// ───── Main component ─────

const MetadataSettings = () => {
  const {
    data: preference = MetadataProviderPreference.TMDB_PRIMARY,
    isLoading: preferenceLoading,
  } = useMetadataProviderPreference()

  const {
    mutate: savePreference,
    isPending: preferenceSaving,
    isSuccess: preferenceSuccess,
    isError: preferenceError,
  } = useUpdateMetadataProviderPreference()

  return (
    <>
      <title>Metadata settings - Maintainerr</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">Metadata Settings</h3>
          <p className="description">
            Configure API keys for metadata providers. If left empty, the
            built-in default key will be used where available.
          </p>
        </div>

        {/* Provider Preference */}
        {preferenceError ? (
          <Alert type="warning" title="Failed to update provider preference" />
        ) : preferenceSuccess ? (
          <Alert type="info" title="Provider preference updated successfully" />
        ) : undefined}

        <div className="section">
          <h4 className="text-lg font-bold text-amber-500">
            Provider Preference
          </h4>
          <p className="mt-1 text-sm text-zinc-400">
            Choose which metadata provider is tried first for images and media
            details. The other provider is used as a fallback when available.
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
              onChange={(e) =>
                savePreference(e.target.value as MetadataProviderPreference)
              }
            >
              {preferenceOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
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
