import {
  BeakerIcon,
  CheckIcon,
  ExclamationIcon,
  SaveIcon,
} from '@heroicons/react/solid'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { useSettingsOutletContext } from '..'
import {
  useDeleteJellyfinSettings,
  useSaveJellyfinSettings,
  useTestJellyfin,
} from '../../../api/settings'
import Alert from '../../Common/Alert'
import Button from '../../Common/Button'
import DocsButton from '../../Common/DocsButton'

const JellyfinSettings = () => {
  const urlRef = useRef<HTMLInputElement>(null)
  const apiKeyRef = useRef<HTMLInputElement>(null)
  const userIdRef = useRef<HTMLInputElement>(null)

  const [error, setError] = useState<string | undefined>()
  const [testResult, setTestResult] = useState<{
    status: boolean
    message: string
  } | null>(null)
  const [testedSettings, setTestedSettings] = useState<{
    url: string
    apiKey: string
  } | null>(null)

  const { settings } = useSettingsOutletContext()

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

  // Initialize form with existing settings
  useEffect(() => {
    if (settings?.jellyfin_url && urlRef.current) {
      urlRef.current.value = settings.jellyfin_url
    }
    if (settings?.jellyfin_api_key && apiKeyRef.current) {
      apiKeyRef.current.value = settings.jellyfin_api_key
    }
    if (settings?.jellyfin_user_id && userIdRef.current) {
      userIdRef.current.value = settings.jellyfin_user_id
    }
  }, [settings])

  const handleTest = async () => {
    setError(undefined)
    setTestResult(null)

    const url = urlRef.current?.value?.trim()
    const apiKey = apiKeyRef.current?.value?.trim()

    if (!url || !apiKey) {
      setError('Please fill in the Jellyfin URL and API key')
      return
    }

    try {
      const result = await testJellyfin({
        jellyfin_url: url,
        jellyfin_api_key: apiKey,
        jellyfin_user_id: userIdRef.current?.value?.trim() || undefined,
      })

      if (result.code === 1) {
        setTestResult({
          status: true,
          message: result.serverName
            ? `Connected to ${result.serverName} (v${result.version})`
            : result.message,
        })
        setTestedSettings({ url, apiKey })
        toast.success('Jellyfin connection successful!')
      } else {
        setTestResult({ status: false, message: result.message })
        setTestedSettings(null)
        toast.error(`Connection failed: ${result.message}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      setTestResult({ status: false, message })
      setTestedSettings(null)
      toast.error(message)
    }
  }

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(undefined)

    const url = urlRef.current?.value?.trim() ?? ''
    const apiKey = apiKeyRef.current?.value?.trim() ?? ''

    // If both fields are empty, delete the settings (like Jellyseerr pattern)
    const isRemovingSettings = url === '' && apiKey === ''

    if (isRemovingSettings) {
      try {
        await deleteSettings()
        setTestResult(null)
        setTestedSettings(null)
        toast.success('Jellyfin settings cleared')
      } catch (err) {
        toast.error('Failed to clear Jellyfin settings')
      }
      return
    }

    // Validate required fields for saving
    if (!url || !apiKey) {
      setError('Please fill in the Jellyfin URL and API key')
      toast.error('Please fill in the required fields')
      return
    }

    // Check if settings have been tested
    const currentSettingsAreSameAsSaved =
      url === settings?.jellyfin_url && apiKey === settings?.jellyfin_api_key
    const currentSettingsHaveBeenTested =
      testedSettings?.url === url &&
      testedSettings?.apiKey === apiKey &&
      testResult?.status

    if (!currentSettingsAreSameAsSaved && !currentSettingsHaveBeenTested) {
      setError('Please test the connection before saving')
      toast.error('Please test the connection before saving')
      return
    }

    try {
      await saveSettings({
        jellyfin_url: url,
        jellyfin_api_key: apiKey,
        jellyfin_user_id: userIdRef.current?.value?.trim() || undefined,
      })
      toast.success('Jellyfin settings saved successfully!')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save settings'
      toast.error(message)
    }
  }

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

        {error && <Alert type="error" title={error} />}

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
          <form onSubmit={handleSave}>
            <div className="form-row">
              <label htmlFor="jellyfin_url" className="text-label">
                Jellyfin URL
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  <input
                    name="jellyfin_url"
                    id="jellyfin_url"
                    type="text"
                    ref={urlRef}
                    placeholder="http://jellyfin.local:8096"
                    defaultValue={settings?.jellyfin_url || ''}
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="jellyfin_api_key" className="text-label">
                API Key
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  <input
                    name="jellyfin_api_key"
                    id="jellyfin_api_key"
                    type="password"
                    ref={apiKeyRef}
                    placeholder="Enter your Jellyfin API key"
                    defaultValue={settings?.jellyfin_api_key || ''}
                  />
                </div>
                <p className="mt-2 text-sm text-zinc-400">
                  In Jellyfin, go to <strong>Dashboard → API Keys</strong> and
                  create a new API key named &quot;Maintainerr&quot;.
                </p>
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="jellyfin_user_id" className="text-label">
                Admin User ID (Optional)
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  <input
                    name="jellyfin_user_id"
                    id="jellyfin_user_id"
                    type="text"
                    ref={userIdRef}
                    placeholder="Auto-detected if not specified"
                    defaultValue={settings?.jellyfin_user_id || ''}
                  />
                </div>
                <p className="mt-1 text-sm text-zinc-400">
                  Used for admin operations. Leave blank to auto-detect.
                </p>
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
                      disabled={isTestPending}
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
                      disabled={isSavePending || isDeletePending}
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
