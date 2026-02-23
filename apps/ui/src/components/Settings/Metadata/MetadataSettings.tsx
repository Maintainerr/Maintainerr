import { SaveIcon } from '@heroicons/react/solid'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  BasicResponseDto,
  TmdbSetting,
  tmdbSettingSchema,
} from '@maintainerr/contracts'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
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

const MetadataSettings = () => {
  const [testedSettings, setTestedSettings] = useState<
    TmdbSetting | undefined
  >()

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestStatus>()
  const [submitError, setSubmitError] = useState<boolean>(false)
  const [isSubmitSuccessful, setIsSubmitSuccessful] = useState<boolean>(false)

  const {
    register,
    handleSubmit,
    trigger,
    control,
    formState: { errors, isSubmitting, isLoading, defaultValues },
  } = useForm<TmdbSettingFormResult, any, TmdbSettingFormResult>({
    resolver: zodResolver(TmdbSettingFormSchema),
    defaultValues: async () => {
      const resp = await GetApiHandler<TmdbSetting>('/settings/tmdb')
      return {
        api_key: resp.api_key ?? '',
      }
    },
  })

  const api_key = useWatch({ control, name: 'api_key' })

  const isGoingToRemoveSetting = api_key === ''
  const enteredSettingsAreSameAsSaved = api_key === defaultValues?.api_key
  const enteredSettingsHaveBeenTested =
    api_key === testedSettings?.api_key && testResult?.status
  const canSaveSettings =
    (enteredSettingsAreSameAsSaved ||
      enteredSettingsHaveBeenTested ||
      isGoingToRemoveSetting) &&
    !isSubmitting &&
    !isLoading

  const onSubmit = async (data: TmdbSettingFormResult) => {
    setSubmitError(false)
    setIsSubmitSuccessful(false)

    const removingSetting = data.api_key === ''

    try {
      const resp = await (removingSetting
        ? DeleteApiHandler<BasicResponseDto>('/settings/tmdb')
        : PostApiHandler<BasicResponseDto>('/settings/tmdb', data))

      if (resp.code) {
        setIsSubmitSuccessful(true)
      } else {
        setSubmitError(true)
      }
    } catch (err) {
      setSubmitError(true)
    }
  }

  const performTest = async () => {
    if (testing || !(await trigger())) return

    setTesting(true)

    await PostApiHandler<BasicResponseDto>('/settings/test/tmdb', {
      api_key: api_key,
    } satisfies TmdbSetting)
      .then((resp) => {
        setTestResult({
          status: resp.code === 1,
          message: resp.message ?? 'Unknown error',
        })

        if (resp.code === 1) {
          setTestedSettings({ api_key })
        }
      })
      .catch(() => {
        setTestResult({
          status: false,
          message: 'Unknown error',
        })
      })
      .finally(() => {
        setTesting(false)
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
            built-in default key will be used.
          </p>
        </div>

        {submitError ? (
          <Alert type="warning" title="Something went wrong" />
        ) : isSubmitSuccessful ? (
          <Alert type="info" title="Metadata settings successfully updated" />
        ) : undefined}

        {testResult != null &&
          (testResult.status ? (
            <Alert type="info" title="Successfully connected to TMDB" />
          ) : (
            <Alert type="error" title={testResult.message} />
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

          <form onSubmit={handleSubmit(onSubmit)}>
            <InputGroup
              label="API Key"
              type="password"
              {...register('api_key')}
              error={errors.api_key?.message}
              helpText="Leave empty to use the default shared key"
            />

            <div className="actions mt-5 w-full">
              <div className="flex w-full flex-wrap justify-end sm:flex-nowrap">
                <div className="m-auto mt-3 flex xs:mt-0 sm:m-0 sm:justify-end">
                  <Button
                    buttonType="success"
                    onClick={performTest}
                    className="ml-3"
                    disabled={testing || isGoingToRemoveSetting}
                  >
                    {testing ? 'Testing...' : 'Test'}
                  </Button>
                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <Button
                      buttonType="primary"
                      type="submit"
                      disabled={!canSaveSettings}
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
