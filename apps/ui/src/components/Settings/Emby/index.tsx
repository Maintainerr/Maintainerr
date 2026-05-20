import { zodResolver } from '@hookform/resolvers/zod'
import {
  type EmbySetting,
  embySettingSchema,
  maskSecret,
} from '@maintainerr/contracts'
import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useSettingsOutletContext } from '..'
import {
  useDeleteEmbySettings,
  useEmbySettings,
  useSaveEmbySettings,
  useTestEmby,
} from '../../../api/settings'
import { getApiErrorMessage } from '../../../utils/ApiError'
import { stripTrailingSlashes } from '../../../utils/SettingsUtils'
import Alert from '../../Common/Alert'
import DocsButton from '../../Common/DocsButton'
import SaveButton from '../../Common/SaveButton'
import TestingButton from '../../Common/TestingButton'
import { InputGroup } from '../../Forms/Input'
import { Select } from '../../Forms/Select'
import EmbyLoginButton from '../../Login/Emby/EmbyLoginButton'
import SettingsAlertSlot from '../SettingsAlertSlot'
import { useSettingsFeedback } from '../useSettingsFeedback'

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
  const { feedback, showUpdated, showError, clearError } =
    useSettingsFeedback('Emby settings')

  const { settings } = useSettingsOutletContext()

  const { data: embyData } = useEmbySettings({ enabled: !!settings })
  const isEmbyLoading = settings != null && embyData == null

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
  })

  const embyUrl = useWatch({ control, name: 'emby_url' })
  const embyApiKey = useWatch({ control, name: 'emby_api_key' })

  useEffect(() => {
    if (embyData) {
      reset({
        emby_url: embyData.emby_url ?? '',
        emby_api_key: embyData.emby_api_key ?? '',
        emby_user_id: embyData.emby_user_id ?? '',
      })
    }
  }, [embyData, reset])

  const isGoingToRemoveSettings = embyUrl === '' && embyApiKey === ''
  const enteredSettingsHaveBeenTested =
    embyUrl === testedSettings?.url &&
    embyApiKey === testedSettings?.apiKey &&
    testResult?.status
  const canSaveSettings =
    !isEmbyLoading && !isTestPending && !isSavePending && !isDeletePending

  const clearTransientState = () => {
    clearError()
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

    setTestResult(null)

    try {
      const result = await testEmby({
        emby_url: embyUrl,
        emby_api_key: embyApiKey,
      })

      if (result.code === 1) {
        setTestResult({
          status: true,
          message: result.serverName
            ? `Connected to ${result.serverName} (v${result.version})`
            : result.message,
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
        'Failed to connect to Emby. Verify URL and API key.',
      )
      setTestResult({ status: false, message })
      setTestedSettings(null)
      setEmbyUsers([])
    }
  }

  const onSubmit = async (data: EmbySettingFormResult) => {
    clearError()

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
          getApiErrorMessage(error, 'Emby settings could not be updated'),
        )
      }
      return
    }

    try {
      await saveSettings(data as EmbySetting)
      reset(data)
      showUpdated()
    } catch (error) {
      showError(getApiErrorMessage(error, 'Emby settings could not be updated'))
    }
  }

  const savedUserId = settings?.emby_user_id ?? ''

  return (
    <>
      <title>Emby settings - Maintainerr</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">Emby Settings</h3>
          <p className="description">
            Configure your Emby server connection. Enter the server URL plus an
            API key, or sign in with admin credentials to obtain one.
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
              name="emby_url"
              control={control}
              render={({ field }) => (
                <InputGroup
                  label="Emby URL"
                  value={field.value}
                  placeholder="http://emby.local:8096"
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

            <InputGroup
              label="API Key"
              type="password"
              {...registerApiKey}
              error={errors.emby_api_key?.message}
              helpText={
                <>
                  In Emby, go to{' '}
                  <strong>Dashboard &rarr; Advanced &rarr; API Keys</strong> and
                  create a new key named &quot;Maintainerr&quot;. Or use{' '}
                  <em>Sign in with Emby</em> below to obtain one automatically.
                </>
              }
            />

            <div className="mt-6 max-w-6xl sm:mt-5 sm:grid sm:grid-cols-3 sm:items-start sm:gap-4">
              <label htmlFor="emby_user_id" className="sm:mt-2">
                Admin User
              </label>
              <div className="px-3 py-2 sm:col-span-2">
                <div className="max-w-xl">
                  {embyUsers.length > 0 && enteredSettingsHaveBeenTested ? (
                    <Select {...register('emby_user_id')}>
                      {embyUsers.map((user) => (
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
                          Test connection to load Emby admin users
                        </option>
                      )}
                    </Select>
                  )}
                  <p className="mt-1 text-sm text-zinc-400">
                    {embyUsers.length > 0 && enteredSettingsHaveBeenTested
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
                  <DocsButton page="Configuration/#emby" />
                </span>
                <div className="m-auto mt-3 flex xs:mt-0 sm:m-0 sm:justify-end">
                  <EmbyLoginButton
                    embyUrl={embyUrl}
                    onAuthenticated={(result) => {
                      setValue('emby_api_key', result.token)
                      setValue('emby_user_id', result.userId)
                      if (result.users) setEmbyUsers(result.users)
                      setTestResult({
                        status: true,
                        message: result.serverName
                          ? `Authenticated against ${result.serverName}`
                          : 'Authenticated',
                      })
                      setTestedSettings({
                        url: embyUrl,
                        apiKey: result.token,
                      })
                    }}
                  />
                  <TestingButton
                    type="button"
                    buttonType="success"
                    onClick={handleTest}
                    className="ml-3"
                    disabled={
                      isEmbyLoading || isTestPending || isGoingToRemoveSettings
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

export default EmbySettings
