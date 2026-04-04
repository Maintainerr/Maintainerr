import { DownloadIcon, RefreshIcon } from '@heroicons/react/solid'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useSettingsOutletContext } from '..'
import { usePatchSettings } from '../../../api/settings'
import GetApiHandler from '../../../utils/ApiHandler'
import Button from '../../Common/Button'
import DocsButton from '../../Common/DocsButton'
import SaveButton from '../../Common/SaveButton'
import MediaServerSelector from '../MediaServerSelector'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'
import DatabaseBackupModal from './DatabaseBackupModal'

interface GeneralSettingsFormValues {
  applicationUrl: string
  apikey: string
}

const MainSettings = () => {
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const {
    feedback,
    showUpdated,
    showUpdateError,
    showInfo,
    showError,
    clear,
    clearError,
  } = useSettingsFeedback('General settings')
  const { settings } = useSettingsOutletContext()

  const initialValues = useMemo<GeneralSettingsFormValues>(
    () => ({
      applicationUrl: settings.applicationUrl ?? '',
      apikey: settings.apikey ?? '',
    }),
    [settings.apikey, settings.applicationUrl],
  )

  return (
    <>
      <title>General settings - Maintainerr</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">General Settings</h3>
          <p className="description">Configure global settings</p>
        </div>
        <SettingsFeedbackAlert feedback={feedback} />

        {showDownloadModal && (
          <DatabaseBackupModal onClose={() => setShowDownloadModal(false)} />
        )}

        <div className="section">
          <MainSettingsForm
            key={`${initialValues.applicationUrl}:${initialValues.apikey}`}
            initialValues={initialValues}
            onOpenBackup={() => setShowDownloadModal(true)}
            onClearError={clearError}
            onUpdated={showUpdated}
            onUpdateError={showUpdateError}
          />
        </div>

        <MediaServerSelector
          currentType={settings.media_server_type ?? null}
          onClearFeedback={clear}
          onInfo={showInfo}
          onError={showError}
        />
      </div>
    </>
  )
}

const MainSettingsForm = ({
  initialValues,
  onOpenBackup,
  onClearError,
  onUpdated,
  onUpdateError,
}: {
  initialValues: GeneralSettingsFormValues
  onOpenBackup: () => void
  onClearError: () => void
  onUpdated: () => void
  onUpdateError: () => void
}) => {
  const [savedValues, setSavedValues] =
    useState<GeneralSettingsFormValues>(initialValues)
  const { mutateAsync: updateSettings, isPending } = usePatchSettings()

  const { register, handleSubmit, reset, getValues, control } =
    useForm<GeneralSettingsFormValues>({
      defaultValues: initialValues,
    })

  const applicationUrl = useWatch({ control, name: 'applicationUrl' }) ?? ''
  const apiKey = useWatch({ control, name: 'apikey' }) ?? ''

  const hasChanges =
    applicationUrl !== savedValues.applicationUrl ||
    apiKey !== savedValues.apikey
  const canSave = hasChanges && !isPending

  const submit = async (data: GeneralSettingsFormValues) => {
    onClearError()

    try {
      await updateSettings(data)
      setSavedValues(data)
      reset(data)
      onUpdated()
    } catch {
      onUpdateError()
    }
  }

  const regenerateApi = async () => {
    onClearError()

    try {
      const key = await GetApiHandler<string>('/settings/api/generate')

      await updateSettings({
        apikey: key,
      })

      setSavedValues((currentSavedValues) => ({
        ...currentSavedValues,
        apikey: key,
      }))
      reset(
        {
          applicationUrl: getValues('applicationUrl'),
          apikey: key,
        },
        {
          keepValues: true,
        },
      )

      onUpdated()
    } catch {
      onUpdateError()
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)}>
      <div className="form-row">
        <label htmlFor="hostname" className="text-label">
          Hostname
        </label>
        <div className="form-input">
          <div className="form-input-field">
            <input
              id="hostname"
              type="text"
              {...register('applicationUrl', { onChange: onClearError })}
            ></input>
          </div>
        </div>
      </div>

      <div className="form-row">
        <label htmlFor="api-key" className="text-label">
          API key
        </label>
        <div className="form-input">
          <div className="form-input-field">
            <input
              className="!rounded-r-none"
              id="api-key"
              type="text"
              {...register('apikey', { onChange: onClearError })}
            ></input>
            <button
              aria-label="Regenerate API key"
              onClick={(e) => {
                e.preventDefault()
                void regenerateApi()
              }}
              className="input-action ml-3"
            >
              <RefreshIcon />
            </button>
          </div>
        </div>
      </div>
      <div className="actions mt-5 w-full">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex rounded-md shadow-sm">
              <DocsButton />
            </span>
            <span className="flex rounded-md shadow-sm">
              <Button buttonType="default" type="button" onClick={onOpenBackup}>
                <DownloadIcon />
                <span>Backup Database</span>
              </Button>
            </span>
          </div>
          <span className="flex rounded-md shadow-sm sm:ml-auto">
            <SaveButton
              type="submit"
              disabled={!canSave}
              isPending={isPending}
            />
          </span>
        </div>
      </div>
    </form>
  )
}

export default MainSettings
