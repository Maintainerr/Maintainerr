import {
  DownloadClientSetting,
  downloadClientSettingSchema,
} from '@maintainerr/contracts'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useSettingsOutletContext } from '..'
import {
  useDeleteDownloadClientSettings,
  useDownloadClientSettings,
  useSaveDownloadClientSettings,
  useTestDownloadClient,
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

interface DownloadClientFormValues {
  download_client_url: string
  download_client_username: string
  download_client_password: string
  download_client_delete_data: boolean
  // Fallback ratio used only when qBittorrent enforces no limit of its own.
  download_client_fallback_ratio: string
}

const FALLBACK_RATIO_DEFAULT = '0.5'

const emptyValues: DownloadClientFormValues = {
  download_client_url: '',
  download_client_username: '',
  download_client_password: '',
  download_client_delete_data: true,
  download_client_fallback_ratio: FALLBACK_RATIO_DEFAULT,
}

// qBittorrent is the only supported download client today, so this page shows
// its connection fields directly. When a second client is added, introduce a
// client-type selector and model the layout on the Metadata settings section
// (src/components/Settings/Metadata) — a single selector plus the chosen
// backend's fields is the clean reference for "pick one of several backends".
const DownloadClientSettings = () => {
  const [testResult, setTestResult] = useState<{
    status: boolean
    message: string
  } | null>(null)
  const [testedConnection, setTestedConnection] = useState<string | null>(null)
  const { feedback, showUpdated, showError, clearError } = useSettingsFeedback(
    'Download client settings',
  )

  const basePath = import.meta.env.VITE_BASE_PATH ?? ''

  const { settings } = useSettingsOutletContext()

  const { data: downloadClientData } = useDownloadClientSettings({
    enabled: !!settings,
  })
  const isLoading = settings != null && downloadClientData == null

  // Sync the form to loaded settings via react-hook-form's `values` option
  // (deep-compared, so no effect / render loop).
  const formValues: DownloadClientFormValues | undefined = downloadClientData
    ? {
        download_client_url: downloadClientData.download_client_url ?? '',
        download_client_username:
          downloadClientData.download_client_username ?? '',
        download_client_password:
          downloadClientData.download_client_password ?? '',
        download_client_delete_data:
          downloadClientData.download_client_delete_data,
        download_client_fallback_ratio:
          downloadClientData.download_client_fallback_ratio != null
            ? String(downloadClientData.download_client_fallback_ratio)
            : FALLBACK_RATIO_DEFAULT,
      }
    : undefined

  const { mutateAsync: testDownloadClient, isPending: isTestPending } =
    useTestDownloadClient()
  const { mutateAsync: saveSettings, isPending: isSavePending } =
    useSaveDownloadClientSettings()
  const { mutateAsync: deleteSettings, isPending: isDeletePending } =
    useDeleteDownloadClientSettings()

  const {
    control,
    handleSubmit,
    getValues,
    reset,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<DownloadClientFormValues>({
    defaultValues: emptyValues,
    values: formValues,
  })

  const url = useWatch({ control, name: 'download_client_url' })
  const username = useWatch({ control, name: 'download_client_username' })
  const password = useWatch({ control, name: 'download_client_password' })

  const isGoingToRemove = (url ?? '') === ''
  const connectionKey = `${url} ${username} ${password}`
  const enteredConnectionHasBeenTested =
    testedConnection === connectionKey && testResult?.status
  const canSave =
    !isLoading && !isTestPending && !isSavePending && !isDeletePending

  const clearTransientState = () => {
    clearError()
    setTestResult(null)
    setTestedConnection(null)
  }

  // Validate the connection/options into the contract shape, mapping failures to
  // inline field errors. Returns null when invalid.
  const validate = (
    values: DownloadClientFormValues,
  ): DownloadClientSetting | null => {
    clearErrors()

    const fallbackRatio = Number(values.download_client_fallback_ratio)
    if (
      values.download_client_fallback_ratio.trim() === '' ||
      Number.isNaN(fallbackRatio) ||
      fallbackRatio < 0.5
    ) {
      setError('download_client_fallback_ratio', {
        type: 'manual',
        message: 'Enter a ratio of 0.5 or higher',
      })
      return null
    }

    const payload: DownloadClientSetting = {
      download_client_url: values.download_client_url,
      download_client_username: values.download_client_username,
      download_client_password: values.download_client_password,
      download_client_delete_data: values.download_client_delete_data,
      download_client_fallback_ratio: fallbackRatio,
    }

    const result = downloadClientSettingSchema.safeParse(payload)
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        const field = String(issue.path[0])
        if (field in emptyValues) {
          setError(field as keyof DownloadClientFormValues, {
            type: 'manual',
            message: issue.message,
          })
        }
      })
      return null
    }

    return result.data
  }

  const onSubmit = async (values: DownloadClientFormValues) => {
    clearError()

    if (values.download_client_url.trim() === '') {
      try {
        await deleteSettings()
        reset(emptyValues)
        setTestResult(null)
        setTestedConnection(null)
        showUpdated()
      } catch (error) {
        showError(
          getApiErrorMessage(
            error,
            'Download client settings could not be updated',
          ),
        )
      }
      return
    }

    const payload = validate(values)
    if (!payload) {
      return
    }

    try {
      await saveSettings(payload)
      reset(values)
      showUpdated()
    } catch (error) {
      showError(
        getApiErrorMessage(
          error,
          'Download client settings could not be updated',
        ),
      )
    }
  }

  const handleTest = async () => {
    if (isTestPending) {
      return
    }

    const payload = validate(getValues())
    if (!payload) {
      return
    }

    setTestResult(null)

    try {
      const result = await testDownloadClient(payload)

      if (result.code === 1) {
        // Bare version string; the success alert wraps it in parentheses.
        setTestResult({
          status: true,
          message: result.message ?? '',
        })
        setTestedConnection(connectionKey)
      } else {
        setTestResult({
          status: false,
          message:
            result.message ||
            'Failed to connect to the download client. Verify URL and credentials.',
        })
        setTestedConnection(null)
      }
    } catch (error) {
      setTestResult({
        status: false,
        message: getApiErrorMessage(
          error,
          'Failed to connect to the download client. Verify URL and credentials.',
        ),
      })
      setTestedConnection(null)
    }
  }

  return (
    <>
      <title>Download client settings - Maintainerr</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading flex items-center gap-2">
            Download Client
            <img
              className="h-[1em] w-[2.5em]"
              width={'0'}
              height={'0'}
              src={`${basePath}/beta.svg`}
              alt="BETA"
            />
          </h3>
          <p className="description">
            When media is removed through Radarr or Sonarr, Maintainerr can
            remove the completed download (and optionally its data) from your
            download client. The download is matched via the Radarr/Sonarr
            download history, so media removed without Radarr/Sonarr is left
            untouched. qBittorrent is currently the only supported client.
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
                  title={
                    testResult.status
                      ? `Successfully connected to the download client${testResult.message ? ` (${testResult.message})` : ''}`
                      : testResult.message
                  }
                />
              ) : null}
            </div>
          ) : null}
        </SettingsAlertSlot>

        <div className="section">
          <form onSubmit={handleSubmit(onSubmit)}>
            <Controller
              name="download_client_url"
              control={control}
              render={({ field }) => (
                <InputGroup
                  label="URL"
                  value={field.value}
                  placeholder="http://localhost:8080"
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
                  error={errors.download_client_url?.message}
                  required
                />
              )}
            />

            <Controller
              name="download_client_username"
              control={control}
              render={({ field }) => (
                <InputGroup
                  label="Username"
                  value={field.value}
                  onChange={(event) => {
                    clearTransientState()
                    field.onChange(event)
                  }}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  name={field.name}
                  type="text"
                  error={errors.download_client_username?.message}
                  helpText="Leave blank if the client's WebUI allows unauthenticated access."
                />
              )}
            />

            <Controller
              name="download_client_password"
              control={control}
              render={({ field }) => (
                <InputGroup
                  label="Password"
                  value={field.value}
                  onChange={(event) => {
                    clearTransientState()
                    field.onChange(event)
                  }}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  name={field.name}
                  type="password"
                  error={errors.download_client_password?.message}
                />
              )}
            />

            <div className="mt-6 max-w-6xl sm:mt-5 sm:grid sm:grid-cols-3 sm:items-start sm:gap-4">
              <label htmlFor="download_client_delete_data" className="sm:mt-2">
                Delete downloaded data
                <p className="text-xs font-normal">
                  Also delete the download&apos;s data from disk when removing
                  it. Turn off if you cross-seed.
                </p>
              </label>
              <div className="px-3 py-2 sm:col-span-2">
                <Controller
                  name="download_client_delete_data"
                  control={control}
                  render={({ field }) => (
                    <input
                      id="download_client_delete_data"
                      type="checkbox"
                      className="checkbox"
                      checked={field.value}
                      onChange={(event) => {
                        clearError()
                        field.onChange(event.target.checked)
                      }}
                    />
                  )}
                />
              </div>
            </div>

            <Controller
              name="download_client_fallback_ratio"
              control={control}
              render={({ field }) => (
                <InputGroup
                  label="Fallback seeding ratio"
                  value={field.value}
                  placeholder="0.5"
                  onChange={(event) => {
                    clearError()
                    field.onChange(event)
                  }}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  name={field.name}
                  type="number"
                  step="0.1"
                  min="0.5"
                  error={errors.download_client_fallback_ratio?.message}
                  helpText="Whether a download has finished seeding is decided by qBittorrent's own ratio/seed-time limits. This ratio only applies to downloads qBittorrent isn't limiting, and can't be set below 0.5."
                />
              )}
            />

            <div className="actions mt-5 w-full">
              <div className="flex w-full flex-wrap sm:flex-nowrap">
                <span className="m-auto rounded-md shadow-xs sm:mr-auto sm:ml-3">
                  <DocsButton page="Configuration/#download-client" />
                </span>
                <div className="m-auto mt-3 flex xs:mt-0 sm:m-0 sm:justify-end">
                  <TestingButton
                    type="button"
                    buttonType="success"
                    onClick={handleTest}
                    className="ml-3"
                    disabled={isLoading || isTestPending || isGoingToRemove}
                    isPending={isTestPending}
                    feedbackStatus={
                      enteredConnectionHasBeenTested
                        ? testResult?.status
                        : undefined
                    }
                  />

                  <span className="ml-3 inline-flex rounded-md shadow-xs">
                    <SaveButton
                      type="submit"
                      disabled={!canSave}
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

export default DownloadClientSettings
