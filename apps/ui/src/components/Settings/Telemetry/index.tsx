import { Trans, useLingui } from '@lingui/react/macro'
import { TELEMETRY_SAMPLE_DIVISOR } from '@maintainerr/contracts'
import { Controller, useForm } from 'react-hook-form'
import { useSettingsOutletContext } from '..'
import {
  useTelemetryPreview,
  useUpdateTelemetrySetting,
} from '../../../api/settings'
import BrandLink from '../../Common/BrandLink'
import { SmallLoadingSpinner } from '../../Common/LoadingSpinner'
import SaveButton from '../../Common/SaveButton'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'

// Code constants, never message text: a translation must not be able to change
// where a link points, rename a field the server actually sends, or disagree
// with the divisor the server samples on.
const COLLECTOR_REPO_URL = 'https://github.com/Maintainerr/telemetry-collector'
const COLLECTOR_DASHBOARD_URL = 'https://telemetry.maintainerr.info/'
const SAMPLE_KEY = 'sample'
const DISABLE_ENV = 'TELEMETRY=off'
// Weekly slots, expressed the way a reader thinks about it. Derived from the
// divisor so the copy cannot drift away from what the server does.
const SAMPLE_YEARS = (TELEMETRY_SAMPLE_DIVISOR / 52).toFixed(1)

interface TelemetryFormValues {
  enabled: boolean
}

const TelemetrySettings = () => {
  const { t } = useLingui()
  const { settings } = useSettingsOutletContext()

  const { feedback, showUpdated, showUpdateError } = useSettingsFeedback({
    updated: t`Telemetry settings updated`,
    updateError: t`Telemetry settings could not be updated`,
  })

  const { mutateAsync: updateTelemetrySetting } = useUpdateTelemetrySetting()
  const {
    data: preview,
    isLoading: previewLoading,
    isError: previewFailed,
  } = useTelemetryPreview()

  const {
    handleSubmit,
    control,
    formState: { isSubmitting },
  } = useForm<TelemetryFormValues>({
    // Null means unanswered, which reports, so the box has to show it as on.
    values: { enabled: settings.telemetryEnabled !== false },
  })

  const onSubmit = async (data: TelemetryFormValues) => {
    try {
      await updateTelemetrySetting(data.enabled)
      showUpdated()
    } catch {
      showUpdateError()
    }
  }

  return (
    <>
      <title>{t`Telemetry settings - Maintainerr`}</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">
            <Trans>Telemetry</Trans>
          </h3>
          <p className="description">
            <Trans>
              Maintainerr counts how many servers are running, which version
              they are on, and roughly which features get used, so development
              can follow what people actually run. No identifier for your server
              is ever sent, so one week&apos;s report cannot be tied to the next
              or to any other server. The collector does not read or store IP
              addresses, its{' '}
              <BrandLink external href={COLLECTOR_REPO_URL}>
                source code
              </BrandLink>{' '}
              is public, and so is{' '}
              <BrandLink external href={COLLECTOR_DASHBOARD_URL}>
                every number it publishes
              </BrandLink>
              .
            </Trans>
          </p>
        </div>

        <SettingsFeedbackAlert feedback={feedback} />

        <div className="section">
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="form-row">
              <label htmlFor="enabled" className="text-label">
                <Trans>Send anonymous usage data</Trans>
                <p className="text-xs font-normal">
                  <Trans>
                    Setting {DISABLE_ENV} in the environment turns this off too,
                    whatever is saved here.
                  </Trans>
                </p>
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  <Controller
                    name="enabled"
                    control={control}
                    render={({ field }) => (
                      <input
                        id="enabled"
                        type="checkbox"
                        className="checkbox"
                        checked={field.value}
                        onChange={(event) =>
                          field.onChange(event.target.checked)
                        }
                      />
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="actions mt-5 w-full">
              <div className="flex justify-end">
                <SaveButton
                  type="submit"
                  disabled={isSubmitting}
                  isPending={isSubmitting}
                />
              </div>
            </div>
          </form>
        </div>

        <div className="section">
          <h3 className="heading">
            <Trans>What would be sent</Trans>
          </h3>
          <p className="description">
            <Trans>
              The top section is sent weekly. The {SAMPLE_KEY} section is
              included roughly once every {SAMPLE_YEARS} years per server, and
              is stored only as anonymous counters.
            </Trans>
          </p>

          {previewLoading ? (
            <SmallLoadingSpinner />
          ) : previewFailed || !preview ? (
            <p className="text-sm text-zinc-400">
              <Trans>The preview could not be loaded.</Trans>
            </p>
          ) : (
            <div className="mt-3 max-w-6xl overflow-x-auto rounded-sm border border-zinc-700 bg-zinc-900 p-4">
              <pre className="text-xs text-zinc-200">
                {JSON.stringify(preview, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default TelemetrySettings
