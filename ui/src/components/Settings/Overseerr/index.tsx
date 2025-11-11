import { SaveIcon } from '@heroicons/react/solid'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  BasicResponseDto,
  OverseerrSettingDto,
  overseerrSettingSchema,
} from '@maintainerr/contracts'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import GetApiHandler, {
  DeleteApiHandler,
  PostApiHandler,
} from '../../../utils/ApiHandler'
import Alert from '../../Common/Alert'
import Button from '../../Common/Button'
import DocsButton from '../../Common/DocsButton'
import { InputGroup } from '../../Forms/Input'

interface TestStatus {
  status: boolean
  message: string
}

const OverseerrSettingDeleteSchema = z.object({
  url: z.literal(''),
  api_key: z.literal(''),
})

const OverseerrSettingFormSchema = z.union([
  overseerrSettingSchema,
  OverseerrSettingDeleteSchema,
])

type OverseerrSettingFormResult = z.infer<typeof OverseerrSettingFormSchema>

const stripLeadingSlashes = (url: string) => url.replace(/\/+$/, '')

const OverseerrSettings = () => {
  const [testedSettings, setTestedSettings] = useState<
    OverseerrSettingDto | undefined
  >()

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestStatus>()
  const [submitError, setSubmitError] = useState<boolean>(false)
  const [isSubmitSuccessful, setIsSubmitSuccessful] = useState<boolean>(false)

  useEffect(() => {
    document.title = 'Maintainerr - Settings - Overseerr'
  }, [])

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    control,
    formState: { errors, isSubmitting, isLoading, defaultValues },
  } = useForm<OverseerrSettingFormResult, any, OverseerrSettingFormResult>({
    resolver: zodResolver(OverseerrSettingFormSchema),
    defaultValues: async () => {
      const resp = await GetApiHandler<OverseerrSettingDto>(
        '/settings/overseerr',
      )
      return {
        url: resp.url ?? '',
        api_key: resp.api_key ?? '',
      }
    },
  })

  const url = watch('url')
  const api_key = watch('api_key')

  const isGoingToRemoveSetting = url === '' && api_key === ''
  const enteredSettingsAreSameAsSaved =
    url === defaultValues?.url && api_key === defaultValues?.api_key
  const enteredSettingsHaveBeenTested =
    api_key == testedSettings?.api_key &&
    url == testedSettings?.url &&
    testResult?.status
  const canSaveSettings =
    (enteredSettingsAreSameAsSaved ||
      enteredSettingsHaveBeenTested ||
      isGoingToRemoveSetting) &&
    !isSubmitting &&
    !isLoading

  const onSubmit = async (data: OverseerrSettingDto) => {
    setSubmitError(false)
    setIsSubmitSuccessful(false)

    const removingSetting = data.api_key === '' && data.url === ''

    try {
      const resp = await (removingSetting
        ? DeleteApiHandler<BasicResponseDto>('/settings/overseerr')
        : PostApiHandler<BasicResponseDto>('/settings/overseerr', data))

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

    await PostApiHandler<BasicResponseDto>('/settings/test/overseerr', {
      api_key: api_key,
      url,
    } satisfies OverseerrSettingDto)
      .then((resp) => {
        setTestResult({
          status: resp.code == 1 ? true : false,
          message: resp.message ?? 'Unknown error',
        })

        if (resp.code == 1) {
          setTestedSettings({
            url,
            api_key,
          })
        }
      })
      .catch((e) => {
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
    <div className="h-full w-full">
      <div className="section h-full w-full">
        <h3 className="heading">Overseerr Settings</h3>
        <p className="description">Overseerr configuration</p>
      </div>
      {submitError ? (
        <Alert type="warning" title="Something went wrong" />
      ) : isSubmitSuccessful ? (
        <Alert type="info" title="Overseerr settings successfully updated" />
      ) : undefined}

      {testResult != null &&
        (testResult?.status ? (
          <Alert
            type="info"
            title={`Successfully connected to Overseerr (${testResult.message})`}
          />
        ) : (
          <Alert type="error" title={testResult.message} />
        ))}

      <div className="section">
        <form onSubmit={handleSubmit(onSubmit)}>
          <Controller
            name={'url'}
            defaultValue=""
            control={control}
            render={({ field }) => (
              <InputGroup
                label="URL"
                value={field.value}
                placeholder="http://localhost:5055"
                onChange={field.onChange}
                onBlur={(event) =>
                  field.onChange(stripLeadingSlashes(event.target.value))
                }
                ref={field.ref}
                name={field.name}
                type="text"
                error={errors.url?.message}
                helpText={
                  <>
                    Example URL formats:{' '}
                    <span className="whitespace-nowrap">
                      http://localhost:5055
                    </span>
                    ,{' '}
                    <span className="whitespace-nowrap">
                      http://192.168.1.5/overseerr
                    </span>
                    ,{' '}
                    <span className="whitespace-nowrap">
                      https://overseerr.example.com
                    </span>
                  </>
                }
                required
              />
            )}
          />

          <InputGroup
            label="API key"
            type="password"
            {...register('api_key')}
            error={errors.api_key?.message}
          />

          <div className="actions mt-5 w-full">
            <div className="flex w-full flex-wrap sm:flex-nowrap">
              <span className="m-auto rounded-md shadow-sm sm:ml-3 sm:mr-auto">
                <DocsButton page="Configuration/#overseerr" />
              </span>
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
  )
}

export default OverseerrSettings
