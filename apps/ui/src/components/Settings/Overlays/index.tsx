import { Trans, useLingui } from '@lingui/react/macro'
import { RefreshIcon } from '@heroicons/react/solid'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  overlaySettingsSchema,
  type OverlaySettings,
  type OverlaySettingsUpdate,
} from '@maintainerr/contracts'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import {
  getOverlaySettings,
  processAllOverlays,
  resetAllOverlays,
  useUpdateOverlaySettings,
} from '../../../api/overlays'
import { formatOverlayProcessSummary } from '../../../utils/overlayProcessResult'
import Button from '../../Common/Button'
import DocsButton from '../../Common/DocsButton'
import Modal from '../../Common/Modal'
import PageControlRow from '../../Common/PageControlRow'
import PendingButton from '../../Common/PendingButton'
import SaveButton from '../../Common/SaveButton'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'

// ── Toggle helper ───────────────────────────────────────────────────────

function ToggleField({
  name,
  label,
  checked,
  onChange,
  helpText,
}: {
  name: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  helpText?: React.ReactNode
}) {
  return (
    <div className="mt-6 max-w-6xl sm:mt-5 sm:grid sm:grid-cols-3 sm:items-start sm:gap-4">
      <label htmlFor={name} className="sm:mt-2">
        {label}
        {helpText && <p className="text-xs font-normal">{helpText}</p>}
      </label>
      <div className="form-input">
        <div className="form-input-field">
          <input
            id={name}
            name={name}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="checkbox"
          />
        </div>
      </div>
    </div>
  )
}

// A placeholder rather than message text, so no translation can alter it.
const cronExample = '45 4 * * *'

// ── Main component ──────────────────────────────────────────────────────

const OverlaySettings = () => {
  const { t } = useLingui()
  const navigate = useNavigate()
  const [processing, setProcessing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const [missingCronModalOpen, setMissingCronModalOpen] = useState(false)

  const {
    feedback,
    showUpdated,
    showUpdateError,
    showInfo,
    showSuccess,
    showError,
  } = useSettingsFeedback({
    updated: t`Overlay settings updated`,
    updateError: t`Overlay settings could not be updated`,
  })

  // Persisted (server) enabled state - distinct from the form's in-flight
  // value. Run Now / Reset operate against the server, so they must reflect
  // what the server has, not unsaved toggle changes. The cron is needed
  // only to detect the moment overlays go enabled with no schedule set, so
  // the post-save modal can fire once.
  const [loadedEnabled, setLoadedEnabled] = useState(false)

  const { mutateAsync: updateOverlaySettings } = useUpdateOverlaySettings()

  const {
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting, isLoading },
  } = useForm<OverlaySettings>({
    resolver: zodResolver(overlaySettingsSchema),
    defaultValues: async () => {
      const settings = await getOverlaySettings()
      setLoadedEnabled(settings.enabled)
      return settings
    },
  })

  const onSubmit = async (data: OverlaySettings) => {
    try {
      const updated = await updateOverlaySettings(data as OverlaySettingsUpdate)
      // Surface the missing-schedule guidance the moment overlays *actually*
      // become enabled (server-confirmed) without a cron. Firing only when
      // the persisted state flips false→true keeps the modal from nagging
      // on every save and avoids the wording lie of "enabled" while the
      // form is still dirty.
      const justEnabledWithoutCron =
        updated.enabled && !updated.cronSchedule && !loadedEnabled
      setLoadedEnabled(updated.enabled)
      reset(updated)
      showUpdated()
      if (justEnabledWithoutCron) {
        setMissingCronModalOpen(true)
      }
    } catch {
      showUpdateError()
    }
  }

  const handleProcessAll = async () => {
    setProcessing(true)
    try {
      const result = await processAllOverlays({ force: true })
      showInfo(formatOverlayProcessSummary(result))
    } catch {
      showError(t`Failed to process overlays`)
    } finally {
      setProcessing(false)
    }
  }

  const handleResetAllRequest = () => {
    setConfirmResetOpen(true)
  }

  const handleResetAllConfirm = async () => {
    setConfirmResetOpen(false)
    setResetting(true)
    try {
      await resetAllOverlays()
      showSuccess(t`All overlays have been reset`)
    } catch {
      showError(t`Failed to reset overlays`)
    } finally {
      setResetting(false)
    }
  }

  return (
    <>
      <title>{t`Overlay settings - Maintainerr`}</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">
            <Trans>Overlay Settings</Trans>
          </h3>
          <p className="description">
            <Trans>
              Configure automatic poster and title card overlays for collections
            </Trans>
          </p>
        </div>

        <SettingsFeedbackAlert feedback={feedback} />

        <div className="section">
          <form onSubmit={handleSubmit(onSubmit)}>
            <Controller
              name="enabled"
              control={control}
              render={({ field }) => (
                <ToggleField
                  name="enabled"
                  label={t`Enable overlays`}
                  checked={field.value ?? false}
                  onChange={field.onChange}
                  helpText={t`Master switch for overlay processing`}
                />
              )}
            />

            {/* Actions */}
            <div className="actions mt-5 w-full">
              <PageControlRow
                className="mb-0"
                actions={
                  <>
                    <span className="flex rounded-md shadow-xs">
                      <DocsButton page="overlays" />
                    </span>
                    <span
                      className="flex rounded-md shadow-xs"
                      title={
                        !loadedEnabled
                          ? t`Enable overlays and save to run manually`
                          : undefined
                      }
                    >
                      <PendingButton
                        buttonType="default"
                        type="button"
                        onClick={() => void handleProcessAll()}
                        disabled={processing || !loadedEnabled}
                        isPending={processing}
                        idleLabel={t`Run Now`}
                        pendingLabel={t`Running`}
                        reserveLabel={t`Run Now`}
                        idleIcon={<RefreshIcon />}
                      />
                    </span>
                    <span className="flex rounded-md shadow-xs">
                      <Button
                        buttonType="danger"
                        type="button"
                        onClick={handleResetAllRequest}
                        disabled={processing || resetting}
                      >
                        <span>
                          {resetting ? t`Resetting...` : t`Reset All Overlays`}
                        </span>
                      </Button>
                    </span>
                  </>
                }
                controls={
                  <span className="flex rounded-md shadow-xs sm:ml-auto">
                    <SaveButton
                      type="submit"
                      disabled={isSubmitting || isLoading}
                      isPending={isSubmitting}
                    />
                  </span>
                }
                controlsClassName="sm:w-auto"
              />
            </div>
          </form>
        </div>
      </div>

      {confirmResetOpen && (
        <Modal
          title={t`Restore original artwork for all collections?`}
          size="sm"
          onCancel={() => setConfirmResetOpen(false)}
          footerActions={
            <Button
              buttonType="danger"
              className="ml-3"
              onClick={() => void handleResetAllConfirm()}
            >
              <Trans>Reset</Trans>
            </Button>
          }
        >
          <p>
            <Trans>
              This will revert every applied overlay and restore the original
              posters for all collections.
            </Trans>
          </p>
        </Modal>
      )}

      {missingCronModalOpen && (
        <Modal
          title={t`Overlays are now enabled`}
          size="sm"
          onCancel={() => setMissingCronModalOpen(false)}
          cancelText={t`Got it`}
          footerActions={
            <Button
              buttonType="primary"
              className="ml-3"
              onClick={() => {
                setMissingCronModalOpen(false)
                navigate('/settings/jobs')
              }}
            >
              <Trans>Open Job Settings</Trans>
            </Button>
          }
        >
          <p>
            <Trans>
              To run them automatically, set a schedule in Job Settings.
            </Trans>
          </p>
          <p className="mt-2">
            <Trans>
              Example: <code>{cronExample}</code> (4:45 AM every day).
            </Trans>
          </p>
          <p className="mt-2">
            <Trans>
              If you do not set a schedule, you will need to use Run Now in
              Overlay Settings each time.
            </Trans>
          </p>
        </Modal>
      )}
    </>
  )
}

export default OverlaySettings
