import { DownloadIcon, RefreshIcon } from '@heroicons/react/solid'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSettingsOutletContext } from '..'
import { usePatchSettings } from '../../../api/settings'
import GetApiHandler from '../../../utils/ApiHandler'
import Button from '../../Common/Button'
import DocsButton from '../../Common/DocsButton'
import PageControlRow from '../../Common/PageControlRow'
import SaveButton from '../../Common/SaveButton'
import { FieldJoin, Input } from '../../Forms/Input'
import MediaServerSelector from '../MediaServerSelector'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'
import DatabaseBackupModal from './DatabaseBackupModal'

interface GeneralSettingsFormValues {
  applicationUrl: string
  apikey: string
  leftover_cleanup_enabled: boolean
}

const MainSettings = () => {
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const {
    feedback,
    showUpdated,
    showUpdateError,
    showInfo,
    showSuccess,
    showError,
    clear,
    clearError,
  } = useSettingsFeedback('General settings')
  const { settings } = useSettingsOutletContext()

  const initialValues = useMemo<GeneralSettingsFormValues>(
    () => ({
      applicationUrl: settings.applicationUrl ?? '',
      apikey: settings.apikey ?? '',
      leftover_cleanup_enabled: settings.leftover_cleanup_enabled ?? false,
    }),
    [
      settings.apikey,
      settings.applicationUrl,
      settings.leftover_cleanup_enabled,
    ],
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
          <DatabaseBackupModal
            onClose={() => setShowDownloadModal(false)}
            onDownloaded={() => showSuccess('Database backup downloaded')}
          />
        )}

        <div className="section">
          <MainSettingsForm
            key={`${initialValues.applicationUrl}:${initialValues.apikey}:${initialValues.leftover_cleanup_enabled}`}
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
  const { mutateAsync: updateSettings, isPending } = usePatchSettings()

  const { register, handleSubmit, reset, getValues } =
    useForm<GeneralSettingsFormValues>({
      defaultValues: initialValues,
    })

  const canSave = !isPending

  const submit = async (data: GeneralSettingsFormValues) => {
    onClearError()

    try {
      await updateSettings(data)
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
            <Input
              id="hostname"
              type="text"
              {...register('applicationUrl', { onChange: onClearError })}
            />
          </div>
        </div>
      </div>

      <div className="form-row">
        <label htmlFor="api-key" className="text-label">
          API key
        </label>
        <div className="form-input">
          <div className="form-input-field">
            <FieldJoin>
              <Input
                id="api-key"
                type="text"
                join="left"
                {...register('apikey', { onChange: onClearError })}
              />
              <button
                aria-label="Regenerate API key"
                onClick={(e) => {
                  e.preventDefault()
                  void regenerateApi()
                }}
                className="input-action"
              >
                <RefreshIcon />
              </button>
            </FieldJoin>
          </div>
        </div>
      </div>
      <div className="mt-6 max-w-6xl sm:mt-5 sm:grid sm:grid-cols-3 sm:items-start sm:gap-4">
        <label htmlFor="leftover_cleanup_enabled" className="sm:mt-2">
          Clean up leftover folders
          <p className="text-xs font-normal">
            After a delete removes a movie/show/season&apos;s files via
            Radarr/Sonarr, remove the leftover folder and its sidecar files
            (subtitles, .nfo, artwork). The folder is kept if anything
            unrecognized remains, including a media file. Requires the media
            library mounted into Maintainerr at the same path the *arr reports.
            Off by default.
          </p>
        </label>
        <div className="px-3 py-2 sm:col-span-2">
          <input
            id="leftover_cleanup_enabled"
            type="checkbox"
            className="checkbox"
            {...register('leftover_cleanup_enabled', {
              onChange: onClearError,
            })}
          />
        </div>
      </div>

      <div className="actions mt-5 w-full">
        <PageControlRow
          className="mb-0"
          actions={
            <>
              <span className="flex rounded-md shadow-xs">
                <DocsButton />
              </span>
              <span className="flex rounded-md shadow-xs">
                <Button
                  buttonType="default"
                  type="button"
                  onClick={onOpenBackup}
                >
                  <DownloadIcon />
                  <span>Backup Database</span>
                </Button>
              </span>
            </>
          }
          controls={
            <span className="flex rounded-md shadow-xs sm:ml-auto">
              <SaveButton
                type="submit"
                disabled={!canSave}
                isPending={isPending}
              />
            </span>
          }
          controlsClassName="sm:w-auto"
        />
      </div>
    </form>
  )
}

export default MainSettings
