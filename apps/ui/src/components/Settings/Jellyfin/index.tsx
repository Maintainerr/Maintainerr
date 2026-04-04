import { zodResolver } from '@hookform/resolvers/zod'
import {
  type JellyfinSetting,
  jellyfinSettingSchema,
  maskSecret,
} from '@maintainerr/contracts'
import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useSettingsOutletContext } from '..'
import {
  useDeleteJellyfinSettings,
  useJellyfinSettings,
  useSaveJellyfinSettings,
  useTestJellyfin,
} from '../../../api/settings'
import { getApiErrorMessage } from '../../../utils/ApiError'
import { stripTrailingSlashes } from '../../../utils/SettingsUtils'
import Alert from '../../Common/Alert'
import DocsButton from '../../Common/DocsButton'
import SaveButton from '../../Common/SaveButton'
import TestingButton from '../../Common/TestingButton'
import { InputGroup } from '../../Forms/Input'
import { Select } from '../../Forms/Select'
import SettingsAlertSlot from '../SettingsAlertSlot'
import { useSettingsFeedback } from '../useSettingsFeedback'

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
  const { feedback, showUpdated, showUpdateError, showError, clearError } =
    useSettingsFeedback('Jellyfin settings')

  const { settings } = useSettingsOutletContext()

  const { data: jellyfinData } = useJellyfinSettings({
    enabled: !!settings,
  })
  const isJellyfinLoading = settings != null && jellyfinData == null

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
  })

  const jellyfinUrl = useWatch({ control, name: 'jellyfin_url' })
  const jellyfinApiKey = useWatch({ control, name: 'jellyfin_api_key' })

  // Initialize form when jellyfin settings load (from dedicated endpoint with real values)
  useEffect(() => {
    if (jellyfinData) {
      reset({
        jellyfin_url: jellyfinData.jellyfin_url ?? '',
        jellyfin_api_key: jellyfinData.jellyfin_api_key ?? '',
        jellyfin_user_id: jellyfinData.jellyfin_user_id ?? '',
      })
    }
  }, [jellyfinData, reset])

  const isGoingToRemoveSettings = jellyfinUrl === '' && jellyfinApiKey === ''
  const enteredSettingsHaveBeenTested =
    jellyfinUrl === testedSettings?.url &&
    jellyfinApiKey === testedSettings?.apiKey &&
    testResult?.status
  const canSaveSettings =
    !isJellyfinLoading && !isTestPending && !isSavePending && !isDeletePending

  const clearTransientState = () => {
    clearError()
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

    setTestResult(null)

    try {
      const result = await testJellyfin({
        jellyfin_url: jellyfinUrl,
        jellyfin_api_key: jellyfinApiKey,
      })

      if (result.code === 1) {
        setTestResult({
          status: true,
          message: result.serverName
            ? `Connected to ${result.serverName} (v${result.version})`
            : result.message,
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
        'Failed to connect to Jellyfin. Verify URL and API key.',
      )
      setTestResult({ status: false, message })
      setTestedSettings(null)
      setJellyfinUsers([])
    }
  }

  const onSubmit = async (data: JellyfinSettingFormResult) => {
    clearError()

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
      } catch {
        showUpdateError()
      }
      return
    }

    try {
      await saveSettings(data as JellyfinSetting)
      reset(data)
      showUpdated()
    } catch (error) {
      const message = getApiErrorMessage(error, 'Failed to save settings')
      showError(
        message === 'Failed to save settings'
          ? 'Jellyfin settings could not be updated'
          : message,
      )
    }
  }

  const savedUserId = settings?.jellyfin_user_id ?? ''

  return (
    <>
      <title>Jellyfin settings - Maintainerr</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">Jellyfin Settings</h3>
          <p className="description">
            Configure your Jellyfin server connection
          </p>
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
              name="jellyfin_url"
              control={control}
              render={({ field }) => (
                <InputGroup
                  label="Jellyfin URL"
                  value={field.value}
                  placeholder="http://jellyfin.local:8096"
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

            <InputGroup
              label="API Key"
              type="password"
              {...registerApiKey}
              error={errors.jellyfin_api_key?.message}
              helpText={
                <>
                  In Jellyfin, go to <strong>Dashboard &rarr; API Keys</strong>{' '}
                  and create a new API key named &quot;Maintainerr&quot;.
                </>
              }
            />

            <div className="mt-6 max-w-6xl sm:mt-5 sm:grid sm:grid-cols-3 sm:items-start sm:gap-4">
              <label htmlFor="jellyfin_user_id" className="sm:mt-2">
                Admin User
              </label>
              <div className="px-3 py-2 sm:col-span-2">
                <div className="max-w-xl">
                  {jellyfinUsers.length > 0 && enteredSettingsHaveBeenTested ? (
                    <Select {...register('jellyfin_user_id')}>
                      {jellyfinUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} ({maskSecret(user.id)})
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Select disabled value={savedUserId}>
                      {savedUserId ? (
                        <option value={savedUserId}>
                          Selected: {maskSecret(savedUserId)}
                        </option>
                      ) : (
                        <option value="">
                          Test connection to load Jellyfin admin users
                        </option>
                      )}
                    </Select>
                  )}
                  <p className="mt-1 text-sm text-zinc-400">
                    {jellyfinUsers.length > 0 && enteredSettingsHaveBeenTested
                      ? 'Select the admin user for Maintainerr operations.'
                      : savedUserId
                        ? 'Saved admin user. Test connection to change.'
                        : 'Test connection to load available admin users.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="actions mt-5 w-full">
              <div className="flex w-full flex-wrap sm:flex-nowrap">
                <span className="m-auto rounded-md shadow-sm sm:ml-3 sm:mr-auto">
                  <DocsButton page="Configuration/#jellyfin" />
                </span>
                <div className="m-auto mt-3 flex xs:mt-0 sm:m-0 sm:justify-end">
                  <TestingButton
                    type="button"
                    buttonType="success"
                    onClick={handleTest}
                    className="ml-3"
                    disabled={
                      isJellyfinLoading ||
                      isTestPending ||
                      isGoingToRemoveSettings
                    }
                    isPending={isTestPending}
                    feedbackStatus={
                      enteredSettingsHaveBeenTested
                        ? testResult?.status
                        : undefined
                    }
                  />

                  <span className="ml-3 inline-flex rounded-md shadow-sm">
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

export default JellyfinSettings
