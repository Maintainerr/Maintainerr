import {
  BeakerIcon,
  CheckIcon,
  ExclamationIcon,
  SaveIcon,
} from '@heroicons/react/solid'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  type JellyfinSetting,
  jellyfinSettingSchema,
} from '@maintainerr/contracts'
import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'react-toastify'
import { z } from 'zod'
import { useSettingsOutletContext } from '..'
import {
  useDeleteJellyfinSettings,
  useJellyfinSettings,
  useSaveJellyfinSettings,
  useTestJellyfin,
} from '../../../api/settings'
import { getApiErrorMessage } from '../../../utils/ApiError'
import Alert from '../../Common/Alert'
import Button from '../../Common/Button'
import DocsButton from '../../Common/DocsButton'
import { InputGroup } from '../../Forms/Input'
import { Select } from '../../Forms/Select'

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

const stripTrailingSlashes = (url: string) => url.replace(/\/+$/, '')

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

  const { settings } = useSettingsOutletContext()

  const { data: jellyfinData } = useJellyfinSettings({
    enabled: !!settings,
  })

  const { mutateAsync: testJellyfin, isPending: isTestPending } =
    useTestJellyfin()
  const {
    mutateAsync: saveSettings,
    isPending: isSavePending,
    isSuccess: saveSuccess,
    isError: saveError,
  } = useSaveJellyfinSettings()
  const {
    mutateAsync: deleteSettings,
    isPending: isDeletePending,
    isSuccess: deleteSuccess,
  } = useDeleteJellyfinSettings()

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
  const enteredSettingsAreSameAsSaved =
    jellyfinUrl === (jellyfinData?.jellyfin_url ?? '') &&
    jellyfinApiKey === (jellyfinData?.jellyfin_api_key ?? '')
  const enteredSettingsHaveBeenTested =
    jellyfinUrl === testedSettings?.url &&
    jellyfinApiKey === testedSettings?.apiKey &&
    testResult?.status
  const canSaveSettings =
    (enteredSettingsAreSameAsSaved ||
      enteredSettingsHaveBeenTested ||
      isGoingToRemoveSettings) &&
    !isSavePending &&
    !isDeletePending

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

        toast.success('Jellyfin connection successful!')
      } else {
        setTestResult({ status: false, message: result.message })
        setTestedSettings(null)
        setJellyfinUsers([])
        toast.error(`Connection failed: ${result.message}`)
      }
    } catch (err) {
      const message = getApiErrorMessage(
        err,
        'Failed to connect to Jellyfin. Verify URL and API key.',
      )
      setTestResult({ status: false, message })
      setTestedSettings(null)
      setJellyfinUsers([])
      toast.error(message)
    }
  }

  const onSubmit = async (data: JellyfinSettingFormResult) => {
    if (data.jellyfin_url === '' && data.jellyfin_api_key === '') {
      try {
        await deleteSettings()
        setTestResult(null)
        setTestedSettings(null)
        setJellyfinUsers([])
        toast.success('Jellyfin settings cleared')
      } catch {
        toast.error('Failed to clear Jellyfin settings')
      }
      return
    }

    try {
      await saveSettings(data as JellyfinSetting)
      toast.success('Jellyfin settings saved successfully!')
    } catch (err) {
      const message = getApiErrorMessage(err, 'Failed to save settings')
      toast.error(message)
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

        {saveError && (
          <Alert
            type="error"
            title="There was an error saving Jellyfin settings."
          />
        )}

        {(saveSuccess || deleteSuccess) && (
          <Alert type="info" title="Settings successfully updated" />
        )}

        {testResult && (
          <Alert
            type={testResult.status ? 'info' : 'error'}
            title={testResult.message}
          />
        )}

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
                  onChange={field.onChange}
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
              {...register('jellyfin_api_key')}
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
                          {user.name} ({user.id.slice(0, 4)}...
                          {user.id.slice(-4)})
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Select disabled value={savedUserId}>
                      {savedUserId ? (
                        <option value={savedUserId}>
                          Selected: {savedUserId.slice(0, 4)}...
                          {savedUserId.slice(-4)}
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

            <div className="actions mt-6">
              <div className="flex flex-wrap justify-between">
                <div className="flex">
                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <Button
                      type="button"
                      buttonType={
                        testResult
                          ? testResult.status
                            ? 'success'
                            : 'danger'
                          : 'default'
                      }
                      onClick={handleTest}
                      disabled={isTestPending || isGoingToRemoveSettings}
                    >
                      {testResult ? (
                        testResult.status ? (
                          <CheckIcon className="h-5 w-5" />
                        ) : (
                          <ExclamationIcon className="h-5 w-5" />
                        )
                      ) : (
                        <BeakerIcon className="h-5 w-5" />
                      )}
                      <span className="ml-1">
                        {isTestPending ? 'Testing...' : 'Test Connection'}
                      </span>
                    </Button>
                  </span>

                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <Button
                      buttonType="primary"
                      type="submit"
                      disabled={!canSaveSettings}
                    >
                      <SaveIcon className="h-5 w-5" />
                      <span className="ml-1">
                        {isSavePending || isDeletePending
                          ? 'Saving...'
                          : 'Save Changes'}
                      </span>
                    </Button>
                  </span>
                </div>

                <span className="ml-3 inline-flex rounded-md shadow-sm">
                  <DocsButton page="using-maintainerr/settings/jellyfin" />
                </span>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

export default JellyfinSettings
