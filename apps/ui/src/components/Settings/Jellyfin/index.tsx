import { Trans, useLingui } from '@lingui/react/macro'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  type JellyfinSetting,
  jellyfinSettingSchema,
  maskSecret,
  stripTrailingSlashes,
} from '@maintainerr/contracts'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useSettingsOutletContext } from '..'
import {
  useDeleteJellyfinSettings,
  useJellyfinSettings,
  useSaveJellyfinSettings,
  useTestJellyfin,
} from '../../../api/settings'
import { ServiceBasePathInput } from '../../Forms/ServiceBasePathInput'
import { ServiceApiKeyHelp } from '../../Forms/ServiceApiKeyHelp'
import { ServiceUrlExamples } from '../../Forms/ServiceUrlExamples'
import { getApiErrorMessage } from '../../../utils/ApiError'
import SaveButton from '../../Common/SaveButton'
import TestingButton from '../../Common/TestingButton'
import { InputGroup } from '../../Forms/Input'
import { SelectGroup } from '../../Forms/Select'
import ServiceCard, { ServiceCardFooter } from '../ServiceCard'
import { useSettingsFeedback } from '../useSettingsFeedback'
import { releaseVersion } from '../../../utils/version'

const JellyfinSettingDeleteSchema = z.object({
  jellyfin_url: z.literal(''),
  jellyfin_api_key: z.literal(''),
  jellyfin_user_id: z.string().optional(),
})

const JellyfinSettingFormSchema = z.union([
  jellyfinSettingSchema,
  JellyfinSettingDeleteSchema,
])

type JellyfinSettingFormResult = z.infer<typeof JellyfinSettingFormSchema>

const JellyfinSettings = () => {
  const { t } = useLingui()
  const [testResult, setTestResult] = useState<{
    status: boolean
    message: string
  } | null>(null)
  const [testedSettings, setTestedSettings] = useState<{
    url: string
    apiKey: string
  } | null>(null)
  const [jellyfinUsers, setJellyfinUsers] = useState<
    Array<{ id: string; name: string }>
  >([])
  const { feedback, showUpdated, showError, clear } = useSettingsFeedback({
    updated: t`Saved`,
    updateError: t`Jellyfin settings could not be updated`,
  })

  const { settings } = useSettingsOutletContext()

  const { data: jellyfinData } = useJellyfinSettings({
    enabled: !!settings,
  })
  const isJellyfinLoading = settings != null && jellyfinData == null

  // Sync the form to the loaded settings once they arrive. react-hook-form's
  // `values` option deep-compares, so an unstable reference with equal contents
  // won't re-trigger a reset (no effect, no render loop).
  const formValues = jellyfinData
    ? {
        jellyfin_url: jellyfinData.jellyfin_url ?? '',
        jellyfin_api_key: jellyfinData.jellyfin_api_key ?? '',
        jellyfin_user_id: jellyfinData.jellyfin_user_id ?? '',
      }
    : undefined

  const { mutateAsync: testJellyfin, isPending: isTestPending } =
    useTestJellyfin()
  const { mutateAsync: saveSettings, isPending: isSavePending } =
    useSaveJellyfinSettings()
  const { mutateAsync: deleteSettings, isPending: isDeletePending } =
    useDeleteJellyfinSettings()

  const {
    register,
    handleSubmit,
    trigger,
    control,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm<JellyfinSettingFormResult, any, JellyfinSettingFormResult>({
    resolver: zodResolver(JellyfinSettingFormSchema),
    defaultValues: {
      jellyfin_url: '',
      jellyfin_api_key: '',
      jellyfin_user_id: '',
    },
    values: formValues,
  })

  const jellyfinUrl = useWatch({ control, name: 'jellyfin_url' })
  const jellyfinApiKey = useWatch({ control, name: 'jellyfin_api_key' })

  const isGoingToRemoveSettings = jellyfinUrl === '' && jellyfinApiKey === ''
  const enteredSettingsHaveBeenTested =
    jellyfinUrl === testedSettings?.url &&
    jellyfinApiKey === testedSettings?.apiKey &&
    testResult?.status
  const canSaveSettings =
    !isJellyfinLoading && !isTestPending && !isSavePending && !isDeletePending

  const clearTransientState = () => {
    clear()
    setTestResult(null)
    setTestedSettings(null)
    setJellyfinUsers([])
  }

  const registerApiKey = register('jellyfin_api_key', {
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
      const result = await testJellyfin({
        jellyfin_url: jellyfinUrl,
        jellyfin_api_key: jellyfinApiKey,
      })

      if (result.code === 1) {
        setTestResult({
          status: true,
          message: result.version
            ? t`Success! (${{ version: releaseVersion(result.version) }})`
            : t`Success!`,
        })
        setTestedSettings({ url: jellyfinUrl, apiKey: jellyfinApiKey })

        if (result.users && result.users.length > 0) {
          const sorted = [...result.users].sort((a, b) =>
            a.name.localeCompare(b.name),
          )
          setJellyfinUsers(sorted)

          const currentUserId = getValues('jellyfin_user_id')
          const keepCurrentSelection =
            currentUserId && sorted.find((u) => u.id === currentUserId)
          setValue(
            'jellyfin_user_id',
            keepCurrentSelection ? currentUserId : sorted[0].id,
          )
        }
      } else {
        setTestResult({ status: false, message: result.message })
        setTestedSettings(null)
        setJellyfinUsers([])
      }
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        t`Failed to connect to Jellyfin. Verify URL and API key.`,
      )
      setTestResult({ status: false, message })
      setTestedSettings(null)
      setJellyfinUsers([])
    }
  }

  const onSubmit = async (data: JellyfinSettingFormResult) => {
    clear()

    if (data.jellyfin_url === '' && data.jellyfin_api_key === '') {
      try {
        await deleteSettings()
        reset({
          jellyfin_url: '',
          jellyfin_api_key: '',
          jellyfin_user_id: '',
        })
        setTestResult(null)
        setTestedSettings(null)
        setJellyfinUsers([])
        showUpdated()
      } catch (error) {
        showError(
          getApiErrorMessage(error, t`Jellyfin settings could not be updated`),
        )
      }
      return
    }

    try {
      await saveSettings(data as JellyfinSetting)
      reset(data)
      showUpdated()
    } catch (error) {
      showError(
        getApiErrorMessage(error, t`Jellyfin settings could not be updated`),
      )
    }
  }

  const savedUserId = settings?.jellyfin_user_id ?? ''
  const maskedUserId = maskSecret(savedUserId)

  const usersLoaded = jellyfinUsers.length > 0 && enteredSettingsHaveBeenTested

  return (
    <>
      <title>{t`Jellyfin settings - Maintainerr`}</title>
      <div className="max-w-6xl">
        <ServiceCard title="Jellyfin">
          <form
            className="flex flex-1 flex-col gap-3"
            onSubmit={handleSubmit(onSubmit)}
          >
            <Controller
              name="jellyfin_url"
              control={control}
              render={({ field }) => (
                <InputGroup
                  layout="stacked"
                  label={t`Jellyfin URL`}
                  value={field.value}
                  placeholder="http://jellyfin.local:8096"
                  helpText={
                    <ServiceUrlExamples
                      examples={[
                        'http://localhost:8096',
                        'https://jellyfin.example.com',
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
                  error={errors.jellyfin_url?.message}
                  required
                />
              )}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ServiceBasePathInput
                name="jellyfin_url"
                value={jellyfinUrl ?? ''}
                onChange={(value) => {
                  clearTransientState()
                  setValue('jellyfin_url', value, { shouldDirty: true })
                }}
              />
              <InputGroup
                layout="stacked"
                label={t`API Key`}
                type="password"
                {...registerApiKey}
                error={errors.jellyfin_api_key?.message}
                helpText={
                  <ServiceApiKeyHelp
                    url={jellyfinUrl}
                    path="/web/#/dashboard/keys"
                  >
                    <Trans>Find it here: Dashboard → API Keys</Trans>
                  </ServiceApiKeyHelp>
                }
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {usersLoaded ? (
                <SelectGroup
                  layout="stacked"
                  label={t`Admin User`}
                  helpText={t`Select the admin user for Maintainerr operations.`}
                  {...register('jellyfin_user_id')}
                >
                  {jellyfinUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({maskSecret(user.id)})
                    </option>
                  ))}
                </SelectGroup>
              ) : (
                <SelectGroup
                  layout="stacked"
                  name="jellyfin_user_id"
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
                      {t`Test connection to load Jellyfin admin users`}
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
              <TestingButton
                type="button"
                buttonType="success"
                onClick={handleTest}
                disabled={
                  isJellyfinLoading || isTestPending || isGoingToRemoveSettings
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

export default JellyfinSettings
