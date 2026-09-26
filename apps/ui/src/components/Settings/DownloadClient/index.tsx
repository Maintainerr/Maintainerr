import { Trans, useLingui } from '@lingui/react/macro'
import {
  DownloadClientSetting,
  DownloadClientType,
  downloadClientSettingSchema,
  stripTrailingSlashes,
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
import SaveButton from '../../Common/SaveButton'
import TestingButton from '../../Common/TestingButton'
import { CheckboxGroup } from '../../Forms/CheckboxGroup'
import { InputGroup } from '../../Forms/Input'
import { SelectGroup } from '../../Forms/Select'
import ServiceCard, { ServiceCardFooter } from '../ServiceCard'
import {
  type SettingsFeedback,
  useSettingsFeedback,
} from '../useSettingsFeedback'
import { releaseVersion } from '../../../utils/version'

interface DownloadClientFormValues {
  download_client_type: DownloadClientType | ''
  download_client_url: string
  download_client_username: string
  download_client_password: string
  download_client_delete_data: boolean
  // Fallback ratio used only when the client enforces no limit of its own.
  download_client_fallback_ratio: string
}

const FALLBACK_RATIO_DEFAULT = '0.5'

const emptyValues: DownloadClientFormValues = {
  download_client_type: '',
  download_client_url: '',
  download_client_username: '',
  download_client_password: '',
  download_client_delete_data: true,
  download_client_fallback_ratio: FALLBACK_RATIO_DEFAULT,
}

const DownloadClientSettings = () => {
  const { t } = useLingui()
  const [testResult, setTestResult] = useState<{
    status: boolean
    message: string
  } | null>(null)
  const [testedConnection, setTestedConnection] = useState<string | null>(null)
  const { feedback, showUpdated, showError, clear, clearError } =
    useSettingsFeedback({
      updated: t`Saved`,
      updateError: t`Download client settings could not be updated`,
    })

  const { settings } = useSettingsOutletContext()

  const { data: downloadClientData } = useDownloadClientSettings({
    enabled: !!settings,
  })
  const isLoading = settings != null && downloadClientData == null

  // Sync the form to loaded settings via react-hook-form's `values` option
  // (deep-compared, so no effect / render loop).
  const formValues: DownloadClientFormValues | undefined = downloadClientData
    ? {
        download_client_type: downloadClientData.download_client_type ?? '',
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
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<DownloadClientFormValues>({
    defaultValues: emptyValues,
    values: formValues,
  })

  const url = useWatch({ control, name: 'download_client_url' })
  const clientType = useWatch({ control, name: 'download_client_type' })
  const username = useWatch({ control, name: 'download_client_username' })
  const password = useWatch({ control, name: 'download_client_password' })

  // Example values ride as placeholders so a translation cannot alter them.
  const urlExample =
    clientType === DownloadClientType.TRANSMISSION
      ? 'http://localhost:9091/transmission/rpc'
      : clientType === DownloadClientType.QBITTORRENT
        ? 'http://localhost:8080'
        : ''
  const urlHelp =
    clientType === DownloadClientType.TRANSMISSION
      ? t`The full RPC endpoint, normally ${{ urlExample }}`
      : clientType === DownloadClientType.QBITTORRENT
        ? t`The WebUI address, for example ${{ urlExample }}`
        : t`Select a client first`

  const isGoingToRemove = (url ?? '') === ''
  const connectionKey = `${clientType} ${url} ${username} ${password}`
  const enteredConnectionHasBeenTested =
    testedConnection === connectionKey && testResult?.status
  const canSave =
    !isLoading && !isTestPending && !isSavePending && !isDeletePending

  const clearTransientState = () => {
    clear()
    setTestResult(null)
    setTestedConnection(null)
  }

  // Validate the connection/options into the contract shape, mapping failures to
  // inline field errors. Returns null when invalid.
  const validate = (
    values: DownloadClientFormValues,
  ): DownloadClientSetting | null => {
    clearErrors()

    if (values.download_client_type === '') {
      setError('download_client_type', {
        type: 'manual',
        message: t`Select a client first`,
      })
      return null
    }

    const fallbackRatio = Number(values.download_client_fallback_ratio)
    if (
      values.download_client_fallback_ratio.trim() === '' ||
      Number.isNaN(fallbackRatio) ||
      fallbackRatio < 0.5
    ) {
      setError('download_client_fallback_ratio', {
        type: 'manual',
        message: t`Enter a ratio of 0.5 or higher`,
      })
      return null
    }

    const payload: DownloadClientSetting = {
      download_client_type: values.download_client_type,
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
            t`Download client settings could not be updated`,
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
          t`Download client settings could not be updated`,
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

    clear()
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
            t`Failed to connect to the download client. Verify URL and credentials.`,
        })
        setTestedConnection(null)
      }
    } catch (error) {
      setTestResult({
        status: false,
        message: getApiErrorMessage(
          error,
          t`Failed to connect to the download client. Verify URL and credentials.`,
        ),
      })
      setTestedConnection(null)
    }
  }

  const status: SettingsFeedback =
    feedback ??
    (testResult
      ? {
          type: testResult.status ? 'success' : 'error',
          title: testResult.status
            ? testResult.message
              ? t`Success! (${{ version: releaseVersion(testResult.message) }})`
              : t`Success!`
            : testResult.message,
        }
      : null)

  return (
    <>
      <title>{t`Download client settings - Maintainerr`}</title>
      <div className="max-w-6xl">
        <ServiceCard
          title={
            <span className="flex items-center gap-2">
              <Trans>Download client</Trans>
              <span className="rounded-full bg-maintainerr-600 px-2 text-xs font-medium text-white">
                BETA
              </span>
            </span>
          }
        >
          <form
            className="flex flex-1 flex-col gap-3"
            onSubmit={handleSubmit(onSubmit)}
          >
            <Controller
              name="download_client_url"
              control={control}
              render={({ field }) => (
                <InputGroup
                  layout="stacked"
                  label="URL"
                  value={field.value}
                  placeholder={urlExample}
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
                  helpText={urlHelp}
                  required
                />
              )}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Controller
                name="download_client_type"
                control={control}
                render={({ field }) => (
                  <SelectGroup
                    layout="stacked"
                    name={field.name}
                    label={t`Client`}
                    value={field.value}
                    onChange={(event) => {
                      clearTransientState()
                      clearErrors('download_client_type')
                      const nextType = event.target.value as DownloadClientType
                      field.onChange(nextType)
                      // The URL is specific to the client (RPC endpoint vs WebUI
                      // address), so one client's URL is meaningless for the
                      // other. Only the saved client gets its saved URL back.
                      setValue(
                        'download_client_url',
                        nextType === formValues?.download_client_type
                          ? formValues.download_client_url
                          : '',
                      )
                    }}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    error={errors.download_client_type?.message}
                    required
                  >
                    <option value="" disabled>
                      {t`Select an option`}
                    </option>
                    <option value={DownloadClientType.QBITTORRENT}>
                      qBittorrent
                    </option>
                    <option value={DownloadClientType.TRANSMISSION}>
                      Transmission
                    </option>
                  </SelectGroup>
                )}
              />
              <Controller
                name="download_client_fallback_ratio"
                control={control}
                render={({ field }) => (
                  <InputGroup
                    layout="stacked"
                    label={t`Fallback seeding ratio`}
                    value={field.value}
                    placeholder="0.5"
                    onChange={(event) => {
                      clear()
                      field.onChange(event)
                    }}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    name={field.name}
                    type="number"
                    step="0.1"
                    min="0.5"
                    error={errors.download_client_fallback_ratio?.message}
                    helpText={t`Used only when the client sets no ratio or idle limit. Minimum 0.5.`}
                  />
                )}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Controller
                name="download_client_username"
                control={control}
                render={({ field }) => (
                  <InputGroup
                    layout="stacked"
                    label={t`Username`}
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
                    helpText={t`Leave blank if the client allows unauthenticated access.`}
                  />
                )}
              />
              <Controller
                name="download_client_password"
                control={control}
                render={({ field }) => (
                  <InputGroup
                    layout="stacked"
                    label={t`Password`}
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
            </div>
            <Controller
              name="download_client_delete_data"
              control={control}
              render={({ field }) => (
                <CheckboxGroup
                  id="download_client_delete_data"
                  label={t`Delete downloaded data`}
                  helpText={t`Turn off if you cross-seed.`}
                  checked={field.value}
                  onChange={(event) => {
                    clear()
                    field.onChange(event.target.checked)
                  }}
                />
              )}
            />
            <ServiceCardFooter status={status}>
              <TestingButton
                type="button"
                buttonType="success"
                onClick={handleTest}
                disabled={isLoading || isTestPending || isGoingToRemove}
                isPending={isTestPending}
                feedbackStatus={
                  enteredConnectionHasBeenTested
                    ? testResult?.status
                    : undefined
                }
              />
              <SaveButton
                type="submit"
                disabled={!canSave}
                isPending={isSavePending || isDeletePending}
              />
            </ServiceCardFooter>
          </form>
        </ServiceCard>
      </div>
    </>
  )
}

export default DownloadClientSettings
