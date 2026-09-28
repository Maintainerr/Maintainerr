import { Trans, useLingui } from '@lingui/react/macro'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  type EmbySetting,
  embySettingSchema,
  maskSecret,
  stripTrailingSlashes,
} from '@maintainerr/contracts'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useSettingsOutletContext } from '..'
import {
  useDeleteEmbySettings,
  useEmbySettings,
  useSaveEmbySettings,
  useTestEmby,
} from '../../../api/settings'
import { ServiceApiKeyHelp } from '../../Forms/ServiceApiKeyHelp'
import { ServiceUrlExamples } from '../../Forms/ServiceUrlExamples'
import { getApiErrorMessage } from '../../../utils/ApiError'
import SaveButton from '../../Common/SaveButton'
import TestingButton from '../../Common/TestingButton'
import { InputGroup } from '../../Forms/Input'
import { SelectGroup } from '../../Forms/Select'
import EmbyLoginButton from '../../Login/Emby/EmbyLoginButton'
import ServiceCard, { ServiceCardFooter } from '../ServiceCard'
import { useSettingsFeedback } from '../useSettingsFeedback'
import { releaseVersion } from '../../../utils/version'

const EmbySettingDeleteSchema = z.object({
  emby_url: z.literal(''),
  emby_api_key: z.literal(''),
  emby_user_id: z.string().optional(),
})

const EmbySettingFormSchema = z.union([
  embySettingSchema,
  EmbySettingDeleteSchema,
])

type EmbySettingFormResult = z.infer<typeof EmbySettingFormSchema>

const EmbySettings = () => {
  const { t } = useLingui()
  const [testResult, setTestResult] = useState<{
    status: boolean
    message: string
  } | null>(null)
  const [testedSettings, setTestedSettings] = useState<{
    url: string
    apiKey: string
  } | null>(null)
  const [embyUsers, setEmbyUsers] = useState<
    Array<{ id: string; name: string }>
  >([])
  const { feedback, showUpdated, showError, clear } = useSettingsFeedback({
    updated: t`Saved`,
    updateError: t`Emby settings could not be updated`,
  })

  const { settings } = useSettingsOutletContext()

  const { data: embyData } = useEmbySettings({ enabled: !!settings })
  const isEmbyLoading = settings != null && embyData == null

  // Sync the form to the loaded settings once they arrive. react-hook-form's
  // `values` option deep-compares, so an unstable reference with equal contents
  // won't re-trigger a reset (no effect, no render loop).
  const formValues = embyData
    ? {
        emby_url: embyData.emby_url ?? '',
        emby_api_key: embyData.emby_api_key ?? '',
        emby_user_id: embyData.emby_user_id ?? '',
      }
    : undefined

  const { mutateAsync: testEmby, isPending: isTestPending } = useTestEmby()
  const { mutateAsync: saveSettings, isPending: isSavePending } =
    useSaveEmbySettings()
  const { mutateAsync: deleteSettings, isPending: isDeletePending } =
    useDeleteEmbySettings()

  const {
    register,
    handleSubmit,
    trigger,
    control,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm<EmbySettingFormResult, any, EmbySettingFormResult>({
    resolver: zodResolver(EmbySettingFormSchema),
    defaultValues: {
      emby_url: '',
      emby_api_key: '',
      emby_user_id: '',
    },
    values: formValues,
  })

  const embyUrl = useWatch({ control, name: 'emby_url' })
  const embyApiKey = useWatch({ control, name: 'emby_api_key' })

  const isGoingToRemoveSettings = embyUrl === '' && embyApiKey === ''
  const enteredSettingsHaveBeenTested =
    embyUrl === testedSettings?.url &&
    embyApiKey === testedSettings?.apiKey &&
    testResult?.status
  const canSaveSettings =
    !isEmbyLoading && !isTestPending && !isSavePending && !isDeletePending

  const clearTransientState = () => {
    clear()
    setTestResult(null)
    setTestedSettings(null)
    setEmbyUsers([])
  }

  const registerApiKey = register('emby_api_key', {
    onChange: () => {
      clearTransientState()
    },
  })

  const handleTest = async () => {
    if (isTestPending || !(await trigger())) return

    // The status shows whatever happened last, so a new test hides "Saved".
    clear()
    setTestResult(null)

    try {
      const result = await testEmby({
        emby_url: embyUrl,
        emby_api_key: embyApiKey,
      })

      if (result.code === 1) {
        setTestResult({
          status: true,
          message: result.version
            ? t`Success! (${{ version: releaseVersion(result.version) }})`
            : t`Success!`,
        })
        setTestedSettings({ url: embyUrl, apiKey: embyApiKey })

        if (result.users && result.users.length > 0) {
          const sorted = [...result.users].sort((a, b) =>
            a.name.localeCompare(b.name),
          )
          setEmbyUsers(sorted)

          const currentUserId = getValues('emby_user_id')
          const keepCurrentSelection =
            currentUserId && sorted.find((u) => u.id === currentUserId)
          setValue(
            'emby_user_id',
            keepCurrentSelection ? currentUserId : sorted[0].id,
          )
        }
      } else {
        setTestResult({ status: false, message: result.message })
        setTestedSettings(null)
        setEmbyUsers([])
      }
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        t`Failed to connect to Emby. Verify URL and API key.`,
      )
      setTestResult({ status: false, message })
      setTestedSettings(null)
      setEmbyUsers([])
    }
  }

  const onSubmit = async (data: EmbySettingFormResult) => {
    clear()

    if (data.emby_url === '' && data.emby_api_key === '') {
      try {
        await deleteSettings()
        reset({ emby_url: '', emby_api_key: '', emby_user_id: '' })
        setTestResult(null)
        setTestedSettings(null)
        setEmbyUsers([])
        showUpdated()
      } catch (error) {
        showError(
          getApiErrorMessage(error, t`Emby settings could not be updated`),
        )
      }
      return
    }

    try {
      await saveSettings(data as EmbySetting)
      reset(data)
      showUpdated()
    } catch (error) {
      showError(
        getApiErrorMessage(error, t`Emby settings could not be updated`),
      )
    }
  }

  const savedUserId = settings?.emby_user_id ?? ''
  const maskedUserId = maskSecret(savedUserId)

  const usersLoaded = embyUsers.length > 0 && enteredSettingsHaveBeenTested

  return (
    <>
      <title>{t`Emby settings - Maintainerr`}</title>
      <div className="max-w-6xl">
        <ServiceCard title="Emby">
          <form
            className="flex flex-1 flex-col gap-3"
            onSubmit={handleSubmit(onSubmit)}
          >
            <Controller
              name="emby_url"
              control={control}
              render={({ field }) => (
                <InputGroup
                  layout="stacked"
                  label={t`Emby URL`}
                  value={field.value}
                  placeholder="http://emby.local:8096"
                  helpText={
                    <ServiceUrlExamples
                      examples={[
                        'http://localhost:8096',
                        'https://emby.example.com',
                      ]}
                    />
                  }
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
                  error={errors.emby_url?.message}
                  required
                />
              )}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InputGroup
                layout="stacked"
                label={t`API Key`}
                type="password"
                {...registerApiKey}
                error={errors.emby_api_key?.message}
                helpText={
                  <ServiceApiKeyHelp
                    url={embyUrl}
                    path="/web/index.html#!/apikeys"
                  >
                    <Trans>Find it here: Dashboard → API Keys</Trans>
                  </ServiceApiKeyHelp>
                }
              />
              {usersLoaded ? (
                <SelectGroup
                  layout="stacked"
                  label={t`Admin User`}
                  helpText={t`Select the admin user for Maintainerr operations.`}
                  {...register('emby_user_id')}
                >
                  {embyUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({maskSecret(user.id)})
                    </option>
                  ))}
                </SelectGroup>
              ) : (
                <SelectGroup
                  layout="stacked"
                  name="emby_user_id"
                  label={t`Admin User`}
                  helpText={
                    savedUserId
                      ? t`Saved admin user. Test connection to change.`
                      : t`Test connection to load available admin users.`
                  }
                  disabled
                  value={savedUserId}
                >
                  {savedUserId ? (
                    <option value={savedUserId}>
                      {t`Selected: ${{ maskedUserId }}`}
                    </option>
                  ) : (
                    <option value="">
                      {t`Test connection to load Emby admin users`}
                    </option>
                  )}
                </SelectGroup>
              )}
            </div>

            <ServiceCardFooter
              status={
                feedback ??
                (testResult
                  ? {
                      type: testResult.status ? 'success' : 'error',
                      title: testResult.message,
                    }
                  : null)
              }
            >
              <EmbyLoginButton
                embyUrl={embyUrl}
                onAuthenticated={(result) => {
                  clear()
                  setValue('emby_api_key', result.token)
                  setValue('emby_user_id', result.userId)
                  if (result.users) setEmbyUsers(result.users)
                  setTestResult({ status: true, message: t`Authenticated` })
                  setTestedSettings({ url: embyUrl, apiKey: result.token })
                }}
              />
              <TestingButton
                type="button"
                buttonType="success"
                onClick={handleTest}
                disabled={
                  isEmbyLoading || isTestPending || isGoingToRemoveSettings
                }
                isPending={isTestPending}
                feedbackStatus={
                  enteredSettingsHaveBeenTested ? testResult?.status : undefined
                }
              />
              <SaveButton
                type="submit"
                disabled={!canSaveSettings}
                isPending={isSavePending || isDeletePending}
              />
            </ServiceCardFooter>
          </form>
        </ServiceCard>
      </div>
    </>
  )
}

export default EmbySettings
