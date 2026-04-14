import { RefreshIcon } from '@heroicons/react/solid'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  overlaySettingsSchema,
  type OverlaySettings,
  type OverlaySettingsUpdate,
} from '@maintainerr/contracts'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import {
  getOverlaySettings,
  processAllOverlays,
  resetAllOverlays,
  updateOverlaySettings,
} from '../../../api/overlays'
import Button from '../../Common/Button'
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
  helpText?: string
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
            className="border-zinc-600 hover:border-zinc-500 focus:border-zinc-500 focus:bg-opacity-100 focus:placeholder-zinc-400 focus:outline-none focus:ring-0"
          />
        </div>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────

const OverlaySettings = () => {
  const [processing, setProcessing] = useState(false)
  const [resetting, setResetting] = useState(false)

  const {
    feedback,
    showUpdated,
    showUpdateError,
    showInfo,
    showSuccess,
    showError,
  } = useSettingsFeedback('Overlay settings')

  const {
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting, isLoading },
  } = useForm<OverlaySettings>({
    resolver: zodResolver(overlaySettingsSchema),
    defaultValues: async () => {
      const settings = await getOverlaySettings()
      return settings
    },
  })

  const onSubmit = async (data: OverlaySettings) => {
    try {
      const updated = await updateOverlaySettings(data as OverlaySettingsUpdate)
      reset(updated)
      showUpdated()
    } catch {
      showUpdateError()
    }
  }

  const handleProcessAll = async () => {
    setProcessing(true)
    try {
      const result = await processAllOverlays()
      showInfo(
        `Processed: ${result.processed}, Reverted: ${result.reverted}, Errors: ${result.errors}`,
      )
    } catch {
      showError('Failed to process overlays')
    } finally {
      setProcessing(false)
    }
  }

  const handleResetAll = async () => {
    if (!window.confirm('Reset all overlays? This will revert all posters.')) {
      return
    }
    setResetting(true)
    try {
      await resetAllOverlays()
      showSuccess('All overlays have been reset')
    } catch {
      showError('Failed to reset overlays')
    } finally {
      setResetting(false)
    }
  }

  return (
    <>
      <title>Overlay settings - Maintainerr</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">Overlay Settings</h3>
          <p className="description">
            Configure automatic poster and title card overlays for collections
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
                  label="Enable overlays"
                  checked={field.value}
                  onChange={field.onChange}
                  helpText="Master switch for overlay processing"
                />
              )}
            />

            <Controller
              name="applyOnAdd"
              control={control}
              render={({ field }) => (
                <ToggleField
                  name="applyOnAdd"
                  label="Apply on collection add"
                  checked={field.value}
                  onChange={field.onChange}
                  helpText="Automatically apply overlays when media is added to a collection"
                />
              )}
            />

            {/* Actions */}
            <div className="actions mt-5 w-full">
              <PageControlRow
                className="mb-0"
                actions={
                  <>
                    <span className="flex rounded-md shadow-sm">
                      <PendingButton
                        buttonType="default"
                        type="button"
                        onClick={handleProcessAll}
                        disabled={processing}
                        isPending={processing}
                        idleLabel="Run Now"
                        pendingLabel="Running"
                        reserveLabel="Run Now"
                        idleIcon={<RefreshIcon />}
                      />
                    </span>
                    <span className="flex rounded-md shadow-sm">
                      <Button
                        buttonType="danger"
                        type="button"
                        onClick={handleResetAll}
                        disabled={resetting}
                      >
                        <span>
                          {resetting ? 'Resetting...' : 'Reset All Overlays'}
                        </span>
                      </Button>
                    </span>
                  </>
                }
                controls={
                  <span className="flex rounded-md shadow-sm sm:ml-auto">
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
    </>
  )
}

export default OverlaySettings
