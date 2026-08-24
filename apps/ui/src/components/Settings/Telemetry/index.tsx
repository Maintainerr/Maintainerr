import { Trans, useLingui } from '@lingui/react/macro'
import { TELEMETRY_SAMPLE_DIVISOR } from '@maintainerr/contracts'
import { type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useSettingsOutletContext } from '..'
import {
  useTelemetryPreview,
  useTelemetryStatus,
  useUpdateTelemetrySetting,
} from '../../../api/settings'
import BrandLink from '../../Common/BrandLink'
import DocsButton from '../../Common/DocsButton'
import PayloadViewer from '../../Common/PayloadViewer'
import SaveButton from '../../Common/SaveButton'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'

// Code constants, never message text: a translation must not be able to change
// where a link points, rename a field the server actually sends, or disagree
// with the divisor the server samples on.
const COLLECTOR_REPO_URL = 'https://github.com/Maintainerr/telemetry-collector'
const COLLECTOR_README_URL = `${COLLECTOR_REPO_URL}/blob/development/README.md`
const COLLECTOR_IP_URL = `${COLLECTOR_REPO_URL}#2-do-we-have-your-ip-address`
const SAMPLE_KEY = 'sample'
const DISABLE_ENV = 'TELEMETRY=off'
// Protocol terms, not prose: a translated "URL" or "IP" would name something
// the payload does not contain. Passed in as placeholders so the sentence
// around them stays one translatable message.
const TERM_URL = 'URL'
const TERM_API = 'API'
const TERM_IP = 'IP'
// Weekly slots, expressed the way a reader thinks about it. Derived from the
// divisor so the copy cannot drift away from what the server does.
const SAMPLE_MONTHS = Math.round((TELEMETRY_SAMPLE_DIVISOR / 52) * 12)

interface TelemetryFormValues {
  enabled: boolean
}

/** Fixed height so the loading, error and loaded states all occupy one box. */
const PreviewPanel = ({
  label,
  nextAt,
  locale,
  children,
}: {
  label: string
  nextAt: string | null | undefined
  locale: string
  children: ReactNode
}) => (
  <div className="flex flex-col">
    <div className="text-sm font-medium text-zinc-100">{label}</div>
    {/* Always rendered, blank when the schedule is unknown, so the panel keeps
        its height and the controls below do not move once status resolves. */}
    <div className="mb-2 text-xs text-zinc-400">
      {nextAt ? <Trans>(Next: {formatWhen(nextAt, locale)})</Trans> : '\u00a0'}
    </div>
    {/* Painted the editor's own colour so the spinner sits on the background
        the editor will paint, rather than the box flashing from a lighter
        panel to darker once monaco mounts. */}
    <div className="h-80 overflow-hidden rounded-sm border border-zinc-700 bg-editor">
      {children}
    </div>
  </div>
)

/** Absolute local time; a relative "in 3 days" needs a ticking clock to stay true. */
const formatWhen = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

const TelemetrySettings = () => {
  const { t, i18n } = useLingui()
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
  const { data: status } = useTelemetryStatus()
  const forcedOff = status?.forcedOff === true

  const {
    handleSubmit,
    control,
    formState: { isSubmitting },
  } = useForm<TelemetryFormValues>({
    // Null means unanswered, which reports, so the box has to show it as on.
    values: { enabled: settings.telemetryEnabled !== false },
  })

  // The census is every field except the sampled block, so the split follows
  // the payload shape rather than a hand-kept list of field names.
  const { [SAMPLE_KEY]: sample, ...census } = preview ?? {}

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
        <div className="section">
          <h3 className="heading">
            <Trans>Telemetry</Trans>
          </h3>
          <div className="description space-y-2 leading-relaxed">
            <p className="font-semibold text-zinc-100">
              <Trans>None of the data sent can be tied to your server.</Trans>
            </p>
            <p>
              <Trans>
                No account, no id, no hostname, no {TERM_URL}, no {TERM_API}{' '}
                key, and nothing from your library.
              </Trans>
            </p>
            <p>
              <Trans>
                Your{' '}
                <BrandLink external href={COLLECTOR_IP_URL}>
                  {TERM_IP} address is never read or stored
                </BrandLink>
                , so one week&apos;s report cannot be tied to the next or to any
                other server.
              </Trans>
            </p>
          </div>
        </div>

        <div className="section">
          <h3 className="heading">
            <Trans>What we send</Trans>
          </h3>
          <p className="description">
            <Trans>
              This is the exact report your server would send, stored only as
              anonymous counters.
            </Trans>
          </p>

          {/* The grid renders in every state, and each panel has a fixed
              height, so the controls below never jump when the preview
              resolves. Only the panel contents swap. */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PreviewPanel
              label={t`Weekly`}
              nextAt={status?.nextSendAtWeekly}
              locale={i18n.locale}
            >
              {previewLoading ? null : previewFailed || !preview ? (
                <p className="p-3 text-sm text-zinc-400">
                  <Trans>The preview could not be loaded.</Trans>
                </p>
              ) : (
                <PayloadViewer value={census} />
              )}
            </PreviewPanel>

            <PreviewPanel
              label={t`Every ~${SAMPLE_MONTHS} months`}
              nextAt={status?.nextSendAtRich}
              locale={i18n.locale}
            >
              {previewLoading ? null : previewFailed || !preview ? (
                <p className="p-3 text-sm text-zinc-400">
                  <Trans>The preview could not be loaded.</Trans>
                </p>
              ) : sample === undefined ? (
                <p className="p-3 text-sm text-zinc-400">
                  <Trans>Nothing extra is configured to send.</Trans>
                </p>
              ) : (
                <PayloadViewer value={sample} />
              )}
            </PreviewPanel>
          </div>
        </div>

        <div className="section">
          <h3 className="heading">
            <Trans>Help us help you</Trans>
          </h3>
          <p className="description leading-relaxed">
            <Trans>
              Maintainerr reports anonymous usage once a week. It is the only
              signal we have about which versions, media servers and features
              are actually in use, and it decides what gets built, fixed and
              kept.
            </Trans>
          </p>

          <SettingsFeedbackAlert feedback={feedback} />

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="form-row items-center">
              <label htmlFor="enabled" className="text-label">
                <Trans>Send anonymous usage data</Trans>
                {forcedOff ? (
                  <p className="text-xs font-normal">
                    <Trans>
                      Disabled by {DISABLE_ENV} in the environment, which
                      overrides this setting.
                    </Trans>
                  </p>
                ) : null}
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
                        disabled={forcedOff}
                        checked={forcedOff ? false : field.value}
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
              <div className="flex w-full flex-wrap sm:flex-nowrap">
                <span className="m-auto rounded-md shadow-xs sm:mr-auto sm:ml-3">
                  <DocsButton
                    href={COLLECTOR_README_URL}
                    text={t`Collector source code`}
                  />
                </span>
                <div className="m-auto mt-3 flex xs:mt-0 sm:m-0 sm:justify-end">
                  <SaveButton
                    type="submit"
                    disabled={isSubmitting || forcedOff}
                    isPending={isSubmitting}
                  />
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

export default TelemetrySettings
