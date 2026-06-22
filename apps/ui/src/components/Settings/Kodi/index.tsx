import { zodResolver } from '@hookform/resolvers/zod'
import { type KodiSetting, kodiSettingSchema } from '@maintainerr/contracts'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useSettingsOutletContext } from '..'
import {
  useDeleteKodiSettings,
  useKodiSettings,
  useSaveKodiSettings,
  useTestKodi,
} from '../../../api/settings'
import { getApiErrorMessage } from '../../../utils/ApiError'
import { stripTrailingSlashes } from '../../../utils/SettingsUtils'
import Alert from '../../Common/Alert'
import DocsButton from '../../Common/DocsButton'
import SaveButton from '../../Common/SaveButton'
import TestingButton from '../../Common/TestingButton'
import { InputGroup } from '../../Forms/Input'
import SettingsAlertSlot from '../SettingsAlertSlot'
import { useSettingsFeedback } from '../useSettingsFeedback'

const KodiSettingDeleteSchema = z.object({
  kodi_url: z.literal(''),
  kodi_username: z.literal(''),
  kodi_password: z.string().optional(),
})

const KodiSettingFormSchema = z.union([
  kodiSettingSchema,
  KodiSettingDeleteSchema,
])

type KodiSettingFormResult = z.infer<typeof KodiSettingFormSchema>

const KodiSettings = () => {
  const [testResult, setTestResult] = useState<{
    status: boolean
    message: string
  } | null>(null)
  const [testedSettings, setTestedSettings] = useState<{
    url: string
    username: string
    password: string
  } | null>(null)
  const { feedback, showUpdated, showError, clearError } =
    useSettingsFeedback('Kodi settings')

  const { settings } = useSettingsOutletContext()

  const { data: kodiData } = useKodiSettings({ enabled: !!settings })
  const isKodiLoading = settings != null && kodiData == null

  // Sync the form to the loaded settings once they arrive. react-hook-form's
  // `values` option deep-compares, so an unstable reference with equal contents
  // won't re-trigger a reset (no effect, no render loop).
  const formValues = kodiData
    ? {
        kodi_url: kodiData.kodi_url ?? '',
        kodi_username: kodiData.kodi_username ?? '',
        kodi_password: kodiData.kodi_password ?? '',
      }
    : undefined

  const { mutateAsync: testKodi, isPending: isTestPending } = useTestKodi()
  const { mutateAsync: saveSettings, isPending: isSavePending } =
    useSaveKodiSettings()
  const { mutateAsync: deleteSettings, isPending: isDeletePending } =
    useDeleteKodiSettings()

  const {
    register,
    handleSubmit,
    trigger,
    control,
    reset,
    formState: { errors },
  } = useForm<KodiSettingFormResult, any, KodiSettingFormResult>({
    resolver: zodResolver(KodiSettingFormSchema),
    defaultValues: {
      kodi_url: '',
      kodi_username: '',
      kodi_password: '',
    },
    values: formValues,
  })

  const kodiUrl = useWatch({ control, name: 'kodi_url' })
  const kodiUsername = useWatch({ control, name: 'kodi_username' })
  // Password is optional in the delete-union branch; treat it as a string so
  // the tested-snapshot comparison below stays consistent.
  const kodiPassword = useWatch({ control, name: 'kodi_password' }) ?? ''

  const isGoingToRemoveSettings = kodiUrl === '' && kodiUsername === ''
  const enteredSettingsHaveBeenTested =
    kodiUrl === testedSettings?.url &&
    kodiUsername === testedSettings?.username &&
    kodiPassword === testedSettings?.password &&
    testResult?.status
  const canSaveSettings =
    !isKodiLoading && !isTestPending && !isSavePending && !isDeletePending

  const clearTransientState = () => {
    clearError()
    setTestResult(null)
    setTestedSettings(null)
  }

  const handleTest = async () => {
    if (isTestPending || !(await trigger())) return

    setTestResult(null)

    try {
      const result = await testKodi({
        kodi_url: kodiUrl,
        kodi_username: kodiUsername,
        kodi_password: kodiPassword,
      })

      if (result.code === 1) {
        setTestResult({
          status: true,
          message: result.serverName
            ? `Connected to ${result.serverName} (v${result.version})`
            : result.message,
        })
        setTestedSettings({
          url: kodiUrl,
          username: kodiUsername,
          password: kodiPassword,
        })
      } else {
        setTestResult({ status: false, message: result.message })
        setTestedSettings(null)
      }
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        'Failed to connect to Kodi. Verify URL, username and password.',
      )
      setTestResult({ status: false, message })
      setTestedSettings(null)
    }
  }

  const onSubmit = async (data: KodiSettingFormResult) => {
    clearError()

    if (data.kodi_url === '' && data.kodi_username === '') {
      try {
        await deleteSettings()
        reset({ kodi_url: '', kodi_username: '', kodi_password: '' })
        setTestResult(null)
        setTestedSettings(null)
        showUpdated()
      } catch (error) {
        showError(
          getApiErrorMessage(error, 'Kodi settings could not be updated'),
        )
      }
      return
    }

    try {
      await saveSettings(data as KodiSetting)
      reset(data)
      showUpdated()
    } catch (error) {
      showError(getApiErrorMessage(error, 'Kodi settings could not be updated'))
    }
  }

  return (
    <>
      <title>Kodi settings - Maintainerr</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">Kodi Settings</h3>
          <p className="description">Configure your Kodi server connection</p>
        </div>

        <SettingsAlertSlot>
          {feedback || testResult ? (
            <div className="space-y-4">
              {feedback ? (
                <Alert type={feedback.type} title={feedback.title} />
              ) : null}
              {testResult ? (
                <Alert
                  type={testResult.status ? 'success' : 'error'}
                  title={testResult.message}
                />
              ) : null}
            </div>
          ) : null}
        </SettingsAlertSlot>

        <div className="section">
          <form onSubmit={handleSubmit(onSubmit)}>
            <Controller
              name="kodi_url"
              control={control}
              render={({ field }) => (
                <InputGroup
                  label="Kodi URL"
                  value={field.value}
                  placeholder="http://kodi.local:8080"
                  onChange={(event) => {
                    clearTransientState()
                    field.onChange(event)
                  }}
                  onBlur={(event) =>
                    field.onChange(stripTrailingSlashes(event.target.value))
                  }
                  ref={field.ref}
                  name={field.name}
                  type="text"
                  error={errors.kodi_url?.message}
                  required
                  helpText={
                    <>
                      Enable Kodi&apos;s web server under{' '}
                      <strong>
                        Settings &rarr; Services &rarr; Control
                      </strong>{' '}
                      with <em>Allow remote control via HTTP</em>, then point
                      this at that host and port.
                    </>
                  }
                />
              )}
            />

            <InputGroup
              label="Username"
              type="text"
              {...register('kodi_username', {
                onChange: clearTransientState,
              })}
              error={errors.kodi_username?.message}
              required
              helpText="The HTTP Basic username configured for Kodi's web server."
            />

            <InputGroup
              label="Password"
              type="password"
              {...register('kodi_password', {
                onChange: clearTransientState,
              })}
              error={errors.kodi_password?.message}
              helpText="The HTTP Basic password. Leave blank if the web server has none."
            />

            <div className="actions mt-5 w-full">
              <div className="flex w-full flex-wrap sm:flex-nowrap">
                <span className="m-auto rounded-md shadow-xs sm:mr-auto sm:ml-3">
                  <DocsButton page="Configuration/#kodi" />
                </span>
                <div className="m-auto mt-3 flex xs:mt-0 sm:m-0 sm:justify-end">
                  <TestingButton
                    type="button"
                    buttonType="success"
                    onClick={handleTest}
                    className="ml-3"
                    disabled={
                      isKodiLoading || isTestPending || isGoingToRemoveSettings
                    }
                    isPending={isTestPending}
                    feedbackStatus={
                      enteredSettingsHaveBeenTested
                        ? testResult?.status
                        : undefined
                    }
                  />

                  <span className="ml-3 inline-flex rounded-md shadow-xs">
                    <SaveButton
                      type="submit"
                      disabled={!canSaveSettings}
                      isPending={isSavePending || isDeletePending}
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

export default KodiSettings
