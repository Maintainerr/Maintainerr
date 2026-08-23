import { Trans, useLingui } from '@lingui/react/macro'
import { TELEMETRY_SAMPLE_DIVISOR } from '@maintainerr/contracts'
import { Fragment, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useSettingsOutletContext } from '..'
import {
  useTelemetryPreview,
  useTelemetryStatus,
  useUpdateTelemetrySetting,
} from '../../../api/settings'
import BrandLink from '../../Common/BrandLink'
import DocsButton from '../../Common/DocsButton'
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

/**
 * Colours the preview by walking the parsed payload, not by tokenising the
 * JSON text, so there is no second parser that could disagree with what the
 * server actually sends. Indentation matches JSON.stringify(value, null, 2).
 * Palette is the one the log viewer already uses.
 */
const renderJson = (value: unknown, depth: number): ReactNode => {
  if (value === null) return <span className="text-gray-400">null</span>
  if (typeof value === 'boolean')
    return <span className="text-indigo-400">{String(value)}</span>
  if (typeof value === 'number')
    return <span className="text-yellow-400">{value}</span>
  if (typeof value === 'string')
    return <span className="text-green-400">{JSON.stringify(value)}</span>

  const isArray = Array.isArray(value)
  const entries: [string, unknown][] = isArray
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value as Record<string, unknown>)
  const [open, close] = isArray ? ['[', ']'] : ['{', '}']

  if (entries.length === 0)
    return <span className="text-gray-400">{open + close}</span>

  return (
    <>
      <span className="text-gray-400">{open}</span>
      {'\n'}
      {entries.map(([key, item], index) => (
        <Fragment key={key}>
          {'  '.repeat(depth + 1)}
          {!isArray && (
            <>
              <span className="text-zinc-100">{JSON.stringify(key)}</span>
              <span className="text-gray-400">: </span>
            </>
          )}
          {renderJson(item, depth + 1)}
          {index < entries.length - 1 && (
            <span className="text-gray-400">,</span>
          )}
          {'\n'}
        </Fragment>
      ))}
      {'  '.repeat(depth)}
      <span className="text-gray-400">{close}</span>
    </>
  )
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
    {/* Same flat panel the log stream uses, rather than a bordered card:
        read-only output, not something to interact with. */}
    <div className="h-80 overflow-auto rounded-sm bg-zinc-700 p-3">
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
              {previewLoading ? (
                <SmallLoadingSpinner />
              ) : previewFailed || !preview ? (
                <p className="text-sm text-zinc-400">
                  <Trans>The preview could not be loaded.</Trans>
                </p>
              ) : (
                <pre className="text-xs leading-relaxed text-zinc-200">
                  {renderJson(census, 0)}
                </pre>
              )}
            </PreviewPanel>

            <PreviewPanel
              label={t`Every ~${SAMPLE_MONTHS} months`}
              nextAt={status?.nextSendAtRich}
              locale={i18n.locale}
            >
              {previewLoading ? (
                <SmallLoadingSpinner />
              ) : previewFailed || !preview ? (
                <p className="text-sm text-zinc-400">
                  <Trans>The preview could not be loaded.</Trans>
                </p>
              ) : (
                <pre className="text-xs leading-relaxed text-zinc-200">
                  {sample === undefined ? (
                    <span className="text-gray-400">
                      <Trans>Nothing extra is configured to send.</Trans>
                    </span>
                  ) : (
                    renderJson(sample, 0)
                  )}
                </pre>
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
              Maintainerr is built in our spare time, and we pay the server
              costs from our own pockets since donations do not cover it. We do
              it because we love free software and keeping Maintainerr alive is
              how we give back. The one thing we cannot buy is a picture of what
              people actually run, and that is what decides where the effort
              goes. An anonymous weekly report gives us exactly that. It costs
              you nothing and needs neither code nor time.
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
