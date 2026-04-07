import { SaveIcon } from '@heroicons/react/solid'
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
import PendingButton from '../../Common/PendingButton'
import { InputGroup } from '../../Forms/Input'
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
      <div className="px-3 py-2 sm:col-span-2">
        <input
          id={name}
          name={name}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-5 w-5 rounded border-zinc-600 bg-zinc-700 text-amber-600 focus:ring-amber-500"
        />
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────

const OverlaySettings = () => {
  const [processing, setProcessing] = useState(false)
  const [resetting, setResetting] = useState(false)

  const { feedback, showUpdated, showUpdateError, showInfo, showError } =
    useSettingsFeedback('Overlay settings')

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting, isLoading },
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
      showInfo('All overlays have been reset')
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
            {/* General settings */}
            <fieldset className="mb-6 rounded-lg border border-zinc-700 p-4">
              <legend className="px-2 text-sm font-medium text-amber-500">
                General
              </legend>

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

              <InputGroup
                label="Cron schedule"
                helpText="e.g. 0 3 * * * (daily at 3am). Leave empty to disable scheduled runs."
                {...register('cronSchedule')}
                error={errors.cronSchedule?.message}
              />
            </fieldset>

            {/* Template editor link */}
            <fieldset className="mb-6 rounded-lg border border-zinc-700 p-4">
              <legend className="px-2 text-sm font-medium text-amber-500">
                Templates
              </legend>
              <p className="mb-3 text-sm text-zinc-400">
                Overlay appearance is controlled by templates. Create and
                customize templates in the visual editor, then set a default
                template for poster and/or title card mode.
              </p>
              <a
                href="/settings/overlays/templates"
                className="inline-block rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500"
              >
                Open Template Editor
              </a>
            </fieldset>

            {/* Actions */}
            <div className="actions mt-8 flex flex-wrap gap-3">
              <PendingButton
                buttonType="primary"
                type="submit"
                disabled={isSubmitting || isLoading}
                idleLabel="Save Changes"
                pendingLabel="Saving..."
                isPending={isSubmitting}
                idleIcon={<SaveIcon />}
                reserveLabel="Save Changes"
              />

              <button
                type="button"
                onClick={handleProcessAll}
                disabled={processing}
                className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
              >
                {processing ? 'Processing...' : 'Run Now'}
              </button>

              <button
                type="button"
                onClick={handleResetAll}
                disabled={resetting}
                className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {resetting ? 'Resetting...' : 'Reset All Overlays'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

export default OverlaySettings
