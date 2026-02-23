import { SaveIcon } from '@heroicons/react/solid'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  BasicResponseDto,
  MetadataProviderPreference,
  TmdbSetting,
  tmdbSettingSchema,
  TvdbSetting,
  tvdbSettingSchema,
} from '@maintainerr/contracts'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
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

interface TestStatus {
  status: boolean
  message: string
}

const TmdbSettingDeleteSchema = z.object({
  api_key: z.literal(''),
})

const TmdbSettingFormSchema = z.union([
  tmdbSettingSchema,
  TmdbSettingDeleteSchema,
])

type TmdbSettingFormResult = z.infer<typeof TmdbSettingFormSchema>

const TvdbSettingDeleteSchema = z.object({
  api_key: z.literal(''),
})

const TvdbSettingFormSchema = z.union([
  tvdbSettingSchema,
  TvdbSettingDeleteSchema,
])

type TvdbSettingFormResult = z.infer<typeof TvdbSettingFormSchema>

const MetadataSettings = () => {
  // Provider preference via TanStack Query
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

  // TMDB state
  const [tmdbTestedSettings, setTmdbTestedSettings] = useState<
    TmdbSetting | undefined
  >()
  const [tmdbTesting, setTmdbTesting] = useState(false)
  const [tmdbTestResult, setTmdbTestResult] = useState<TestStatus>()
  const [tmdbSubmitError, setTmdbSubmitError] = useState<boolean>(false)
  const [tmdbSubmitSuccess, setTmdbSubmitSuccess] = useState<boolean>(false)

  // TVDB state
  const [tvdbTestedSettings, setTvdbTestedSettings] = useState<
    TvdbSetting | undefined
  >()
  const [tvdbTesting, setTvdbTesting] = useState(false)
  const [tvdbTestResult, setTvdbTestResult] = useState<TestStatus>()
  const [tvdbSubmitError, setTvdbSubmitError] = useState<boolean>(false)
  const [tvdbSubmitSuccess, setTvdbSubmitSuccess] = useState<boolean>(false)

  // TMDB form
  const {
    register: tmdbRegister,
    handleSubmit: tmdbHandleSubmit,
    trigger: tmdbTrigger,
    control: tmdbControl,
    formState: {
      errors: tmdbErrors,
      isSubmitting: tmdbIsSubmitting,
      isLoading: tmdbIsLoading,
      defaultValues: tmdbDefaultValues,
    },
  } = useForm<TmdbSettingFormResult, any, TmdbSettingFormResult>({
    resolver: zodResolver(TmdbSettingFormSchema),
    defaultValues: async () => {
      const resp = await GetApiHandler<TmdbSetting>('/settings/tmdb')
      return {
        api_key: resp.api_key ?? '',
      }
    },
  })

  const tmdbApiKey = useWatch({ control: tmdbControl, name: 'api_key' })

  const tmdbIsGoingToRemove = tmdbApiKey === ''
  const tmdbSameAsSaved = tmdbApiKey === tmdbDefaultValues?.api_key
  const tmdbHasBeenTested =
    tmdbApiKey === tmdbTestedSettings?.api_key && tmdbTestResult?.status
  const tmdbCanSave =
    (tmdbSameAsSaved || tmdbHasBeenTested || tmdbIsGoingToRemove) &&
    !tmdbIsSubmitting &&
    !tmdbIsLoading

  const onTmdbSubmit = async (data: TmdbSettingFormResult) => {
    setTmdbSubmitError(false)
    setTmdbSubmitSuccess(false)

    const removingSetting = data.api_key === ''

    try {
      const resp = await (removingSetting
        ? DeleteApiHandler<BasicResponseDto>('/settings/tmdb')
        : PostApiHandler<BasicResponseDto>('/settings/tmdb', data))

      if (resp.code) {
        setTmdbSubmitSuccess(true)
      } else {
        setTmdbSubmitError(true)
      }
    } catch (err) {
      setTmdbSubmitError(true)
    }
  }

  const performTmdbTest = async () => {
    if (tmdbTesting || !(await tmdbTrigger())) return

    setTmdbTesting(true)

    await PostApiHandler<BasicResponseDto>('/settings/test/tmdb', {
      api_key: tmdbApiKey,
    } satisfies TmdbSetting)
      .then((resp) => {
        setTmdbTestResult({
          status: resp.code === 1,
          message: resp.message ?? 'Unknown error',
        })

        if (resp.code === 1) {
          setTmdbTestedSettings({ api_key: tmdbApiKey })
        }
      })
      .catch(() => {
        setTmdbTestResult({
          status: false,
          message: 'Unknown error',
        })
      })
      .finally(() => {
        setTmdbTesting(false)
      })
  }

  // TVDB form
  const {
    register: tvdbRegister,
    handleSubmit: tvdbHandleSubmit,
    trigger: tvdbTrigger,
    control: tvdbControl,
    formState: {
      errors: tvdbErrors,
      isSubmitting: tvdbIsSubmitting,
      isLoading: tvdbIsLoading,
      defaultValues: tvdbDefaultValues,
    },
  } = useForm<TvdbSettingFormResult, any, TvdbSettingFormResult>({
    resolver: zodResolver(TvdbSettingFormSchema),
    defaultValues: async () => {
      const resp = await GetApiHandler<TvdbSetting>('/settings/tvdb')
      return {
        api_key: resp.api_key ?? '',
      }
    },
  })

  const tvdbApiKey = useWatch({ control: tvdbControl, name: 'api_key' })

  const tvdbIsGoingToRemove = tvdbApiKey === ''
  const tvdbSameAsSaved = tvdbApiKey === tvdbDefaultValues?.api_key
  const tvdbHasBeenTested =
    tvdbApiKey === tvdbTestedSettings?.api_key && tvdbTestResult?.status
  const tvdbCanSave =
    (tvdbSameAsSaved || tvdbHasBeenTested || tvdbIsGoingToRemove) &&
    !tvdbIsSubmitting &&
    !tvdbIsLoading

  const onTvdbSubmit = async (data: TvdbSettingFormResult) => {
    setTvdbSubmitError(false)
    setTvdbSubmitSuccess(false)

    const removingSetting = data.api_key === ''

    try {
      const resp = await (removingSetting
        ? DeleteApiHandler<BasicResponseDto>('/settings/tvdb')
        : PostApiHandler<BasicResponseDto>('/settings/tvdb', data))

      if (resp.code) {
        setTvdbSubmitSuccess(true)
      } else {
        setTvdbSubmitError(true)
      }
    } catch (err) {
      setTvdbSubmitError(true)
    }
  }

  const performTvdbTest = async () => {
    if (tvdbTesting || !(await tvdbTrigger())) return

    setTvdbTesting(true)

    await PostApiHandler<BasicResponseDto>('/settings/test/tvdb', {
      api_key: tvdbApiKey,
    } satisfies TvdbSetting)
      .then((resp) => {
        setTvdbTestResult({
          status: resp.code === 1,
          message: resp.message ?? 'Unknown error',
        })

        if (resp.code === 1) {
          setTvdbTestedSettings({ api_key: tvdbApiKey })
        }
      })
      .catch(() => {
        setTvdbTestResult({
          status: false,
          message: 'Unknown error',
        })
      })
      .finally(() => {
        setTvdbTesting(false)
      })
  }

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
                savePreference(
                  e.target.value as MetadataProviderPreference,
                )
              }
            >
              <option value={MetadataProviderPreference.TMDB_PRIMARY}>
                TMDB (default)
              </option>
              <option value={MetadataProviderPreference.TVDB_PRIMARY}>
                TVDB
              </option>
            </select>
          </div>
        </div>

        {/* TMDB Section */}
        {tmdbSubmitError ? (
          <Alert type="warning" title="Something went wrong" />
        ) : tmdbSubmitSuccess ? (
          <Alert type="info" title="TMDB settings successfully updated" />
        ) : undefined}

        {tmdbTestResult != null &&
          (tmdbTestResult.status ? (
            <Alert type="info" title="Successfully connected to TMDB" />
          ) : (
            <Alert type="error" title={tmdbTestResult.message} />
          ))}

        <div className="section">
          <h4 className="text-lg font-bold text-amber-500">TMDB</h4>
          <p className="mt-1 text-sm text-zinc-400">
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
          </p>

          <form onSubmit={tmdbHandleSubmit(onTmdbSubmit)}>
            <InputGroup
              label="API Key"
              type="password"
              {...tmdbRegister('api_key')}
              error={tmdbErrors.api_key?.message}
              helpText="Leave empty to use the default shared key"
            />

            <div className="actions mt-5 w-full">
              <div className="flex w-full flex-wrap justify-end sm:flex-nowrap">
                <div className="m-auto mt-3 flex xs:mt-0 sm:m-0 sm:justify-end">
                  <Button
                    buttonType="success"
                    onClick={performTmdbTest}
                    className="ml-3"
                    disabled={tmdbTesting || tmdbIsGoingToRemove}
                  >
                    {tmdbTesting ? 'Testing...' : 'Test'}
                  </Button>
                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <Button
                      buttonType="primary"
                      type="submit"
                      disabled={!tmdbCanSave}
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

        {/* TVDB Section */}
        {tvdbSubmitError ? (
          <Alert type="warning" title="Something went wrong" />
        ) : tvdbSubmitSuccess ? (
          <Alert type="info" title="TVDB settings successfully updated" />
        ) : undefined}

        {tvdbTestResult != null &&
          (tvdbTestResult.status ? (
            <Alert type="info" title="Successfully connected to TVDB" />
          ) : (
            <Alert type="error" title={tvdbTestResult.message} />
          ))}

        <div className="section">
          <h4 className="text-lg font-bold text-amber-500">TVDB</h4>
          <p className="mt-1 text-sm text-zinc-400">
            TheTVDB provides TV show, movie, and person metadata. You can obtain
            an API key at{' '}
            <a
              href="https://thetvdb.com/dashboard/account/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-500 underline hover:text-amber-400"
            >
              thetvdb.com
            </a>
            .
          </p>

          <form onSubmit={tvdbHandleSubmit(onTvdbSubmit)}>
            <InputGroup
              label="API Key"
              type="password"
              {...tvdbRegister('api_key')}
              error={tvdbErrors.api_key?.message}
            />

            <div className="actions mt-5 w-full">
              <div className="flex w-full flex-wrap justify-end sm:flex-nowrap">
                <div className="m-auto mt-3 flex xs:mt-0 sm:m-0 sm:justify-end">
                  <Button
                    buttonType="success"
                    onClick={performTvdbTest}
                    className="ml-3"
                    disabled={tvdbTesting || tvdbIsGoingToRemove}
                  >
                    {tvdbTesting ? 'Testing...' : 'Test'}
                  </Button>
                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <Button
                      buttonType="primary"
                      type="submit"
                      disabled={!tvdbCanSave}
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

export default MetadataSettings
