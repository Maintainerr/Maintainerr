import { SaveIcon } from '@heroicons/react/solid'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  BasicResponseDto,
  TautulliSetting,
  tautulliSettingSchema,
} from '@maintainerr/contracts'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import {
  getApiErrorMessage,
  normalizeConnectionErrorMessage,
} from '../../../utils/ApiError'
import GetApiHandler, {
  DeleteApiHandler,
  PostApiHandler,
} from '../../../utils/ApiHandler'
import Alert from '../../Common/Alert'
import DocsButton from '../../Common/DocsButton'
import PendingButton from '../../Common/PendingButton'
import TestingButton from '../../Common/TestingButton'
import { InputGroup } from '../../Forms/Input'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'
import SettingsAlertSlot from '../SettingsAlertSlot'

interface TestStatus {
  status: boolean
  message: string
}

const TautulliSettingDeleteSchema = z.object({
  url: z.literal(''),
  api_key: z.literal(''),
})

const TautulliSettingFormSchema = z.union([
  tautulliSettingSchema,
  TautulliSettingDeleteSchema,
])

type TautulliSettingFormResult = z.infer<typeof TautulliSettingFormSchema>

const stripLeadingSlashes = (url: string) => url.replace(/\/+$/, '')

const TautulliSettings = () => {
  const [testedSettings, setTestedSettings] = useState<
    TautulliSetting | undefined
  >()

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestStatus>()
  const { feedback, showUpdated, showUpdateError, clearError } =
    useSettingsFeedback('Tautulli settings')

  const {
    register,
    handleSubmit,
    trigger,
    control,
    formState: { errors, isSubmitting, isLoading, defaultValues },
  } = useForm<TautulliSettingFormResult, any, TautulliSettingFormResult>({
    resolver: zodResolver(TautulliSettingFormSchema),
    defaultValues: async () => {
      const resp = await GetApiHandler<TautulliSetting>('/settings/tautulli')
      return {
        url: resp.url ?? '',
        api_key: resp.api_key ?? '',
      }
    },
  })

  const url = useWatch({ control, name: 'url' })
  const api_key = useWatch({ control, name: 'api_key' })

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

  const onSubmit = async (data: TautulliSetting) => {
    clearError()

    const removingSetting = data.api_key === '' && data.url === ''

    try {
      const resp = await (removingSetting
        ? DeleteApiHandler<BasicResponseDto>('/settings/tautulli')
        : PostApiHandler<BasicResponseDto>('/settings/tautulli', data))

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

    await PostApiHandler<BasicResponseDto>('/settings/test/tautulli', {
      api_key: api_key,
      url,
    } satisfies TautulliSetting)
      .then((resp) => {
        setTestResult({
          status: resp.code == 1 ? true : false,
          message: normalizeConnectionErrorMessage(
            resp.message,
            'Failed to connect to Tautulli. Verify URL and API key.',
          ),
        })

        if (resp.code == 1) {
          setTestedSettings({
            url,
            api_key,
          })
        }
      })
      .catch((error: unknown) => {
        setTestResult({
          status: false,
          message: getApiErrorMessage(
            error,
            'Failed to connect to Tautulli. Verify URL and API key.',
          ),
        })
      })
      .finally(() => {
        setTesting(false)
      })
  }

  return (
    <>
      <title>Tautulli settings - Maintainerr</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">Tautulli Settings</h3>
          <p className="description">Tautulli configuration</p>
        </div>
        <SettingsFeedbackAlert feedback={feedback} />

        <SettingsAlertSlot>
          {testResult != null ? (
            testResult?.status ? (
              <Alert
                type="info"
                title={`Successfully connected to Tautulli (${testResult.message})`}
              />
            ) : (
              <Alert type="error" title={testResult.message} />
            )
          ) : null}
        </SettingsAlertSlot>

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
                  placeholder="http://localhost:8181"
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
                        http://localhost:8181
                      </span>
                      ,{' '}
                      <span className="whitespace-nowrap">
                        http://192.168.1.5/tautulli
                      </span>
                      ,{' '}
                      <span className="whitespace-nowrap">
                        https://tautulli.example.com
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
                  <DocsButton page="Configuration/#tautulli" />
                </span>
                <div className="m-auto mt-3 flex xs:mt-0 sm:m-0 sm:justify-end">
                  <TestingButton
                    type="button"
                    buttonType="success"
                    onClick={performTest}
                    className="ml-3"
                    disabled={testing || isGoingToRemoveSetting}
                    isPending={testing}
                    feedbackStatus={testResult?.status}
                  />
                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <PendingButton
                      buttonType="primary"
                      type="submit"
                      disabled={!canSaveSettings}
                      idleLabel="Save Changes"
                      pendingLabel="Saving..."
                      isPending={isSubmitting}
                      idleIcon={<SaveIcon />}
                      reserveLabel="Save Changes"
                    />
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
export default TautulliSettings
