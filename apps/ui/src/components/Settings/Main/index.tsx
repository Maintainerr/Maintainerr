import { DownloadIcon, RefreshIcon } from '@heroicons/react/solid'
import { Trans, useLingui } from '@lingui/react/macro'
import { use, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSettingsOutletContext } from '..'
import { usePatchSettings } from '../../../api/settings'
import LocaleContext from '../../../contexts/locale-context'
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
import LanguageSelector from './LanguageSelector'

interface GeneralSettingsFormValues {
  applicationUrl: string
  apikey: string
  // Not part of the settings payload - applied on save, stored per browser.
  locale: string
}

const MainSettings = () => {
  const { t } = useLingui()
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
  } = useSettingsFeedback({
    updated: t`General settings updated`,
    updateError: t`General settings could not be updated`,
  })
  const { settings } = useSettingsOutletContext()
  const { locale } = use(LocaleContext)

  const initialValues = useMemo<GeneralSettingsFormValues>(
    () => ({
      applicationUrl: settings.applicationUrl ?? '',
      apikey: settings.apikey ?? '',
      locale,
    }),
    [settings.apikey, settings.applicationUrl, locale],
  )

  return (
    <>
      <title>{t`General settings - Maintainerr`}</title>
      <div className="h-full w-full">
        <div className="section mb-2 h-full w-full">
          <h3 className="heading">
            <Trans>General Settings</Trans>
          </h3>
          <p className="description">
            <Trans>Configure global settings</Trans>
          </p>
        </div>
        <SettingsFeedbackAlert feedback={feedback} />

        {showDownloadModal && (
          <DatabaseBackupModal
            onClose={() => setShowDownloadModal(false)}
            onDownloaded={() => showSuccess(t`Database backup downloaded`)}
          />
        )}

        <div className="section my-2">
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
  const { t } = useLingui()
  const { mutateAsync: updateSettings, isPending } = usePatchSettings()
  const { setLocale } = use(LocaleContext)

  const { register, handleSubmit, reset, getValues } =
    useForm<GeneralSettingsFormValues>({
      defaultValues: initialValues,
    })

  const canSave = !isPending

  const submit = async (data: GeneralSettingsFormValues) => {
    onClearError()

    // The locale rides along in the form so it follows the usual Save flow,
    // but it is a browser preference rather than a server setting.
    const { locale, ...settingsPayload } = data

    try {
      await updateSettings(settingsPayload)
      await setLocale(locale)
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
          locale: getValues('locale'),
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
          <Trans>Hostname</Trans>
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
          <Trans>API key</Trans>
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
                aria-label={t`Regenerate API key`}
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

      <LanguageSelector field={register('locale')} />

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
                  <span>
                    <Trans>Backup Database</Trans>
                  </span>
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
