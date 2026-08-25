import { Trans, useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useSettings,
  useTelemetryPreview,
  useUpdateTelemetrySetting,
} from '../../api/settings'
import { hasCompletedMediaServerSetup } from '../../hooks/useMediaServerType'
import Button from '../Common/Button'
import PayloadViewer from '../Common/PayloadViewer'
import Modal from '../Common/Modal'

const TELEMETRY_SETTINGS_ROUTE = '/settings/telemetry'
// Protocol term, not prose: a translated "IP" would name something the report
// does not contain. See issue #3585.
const TERM_IP = 'IP'
const TERM_MAC = 'MAC'

/**
 * Null is an install that predates the setting, and it reports until turned
 * off, so this prompt is their opt-out. New installs start on and never see
 * it. Waits for media server setup rather than interrupting it.
 *
 * Switching it off happens on the settings page, beside the payload it applies
 * to. Nothing is recorded on that path, so an install that leaves without
 * answering is still unanswered and is asked again.
 */
const TelemetryConsentModal = () => {
  const { t } = useLingui()
  const navigate = useNavigate()
  const { data: settings } = useSettings()
  const { mutateAsync: updateTelemetrySetting, isPending } =
    useUpdateTelemetrySetting()
  // The modal lives in Layout, so without this it stays over the page it just
  // sent the user to, scroll locked and the toggle unreachable.
  const [dismissed, setDismissed] = useState(false)
  const prompting =
    !dismissed &&
    settings?.telemetryEnabled === null &&
    hasCompletedMediaServerSetup(settings)
  // Mounted on every page, so the payload is only fetched for the installs
  // that can still be asked.
  const { data: preview } = useTelemetryPreview({ enabled: prompting })
  // The weekly block only: the sampled one rides along a few times a year and
  // has its own panel on the settings page.
  const { sample, ...weekly } = preview ?? {}

  if (!prompting) {
    return null
  }

  const keepOn = async () => {
    try {
      await updateTelemetrySetting(true)
    } catch {
      // Leaving the setting unanswered simply shows the prompt again, so there
      // is nothing to recover from here.
    }
  }

  return (
    <Modal
      title={t`Help shape Maintainerr?`}
      backgroundClickable={false}
      size="lg"
      cancelText={t`Turn it off in settings`}
      onCancel={() => {
        // Nothing is recorded here, so an unanswered install is asked again
        // rather than being treated as having decided.
        setDismissed(true)
        navigate(TELEMETRY_SETTINGS_ROUTE)
      }}
      footerActions={
        <Button
          buttonType="primary"
          className="ml-3"
          disabled={isPending}
          onClick={() => void keepOn()}
        >
          <Trans>Keep it on</Trans>
        </Button>
      }
    >
      <div className="space-y-3">
        <p>
          <Trans>
            Once a week we log which version and platform people actually run.
            The payload below is the whole of it. It carries no server
            identifier, no {TERM_IP}, no hostname, no {TERM_MAC} address and no
            account id: nothing that can be traced back to you, your network or
            your machine.
          </Trans>
        </p>
        <p>
          <Trans>
            We build Maintainerr in our spare time, and leaving this on is a
            free way to help shape what comes next.
          </Trans>
        </p>
        {/* Rendered whatever the preview is doing, so the prompt does not
            change height underneath someone reading it. */}
        <div className="h-56 overflow-hidden rounded-sm border border-zinc-700 bg-editor">
          {preview ? <PayloadViewer value={weekly} /> : null}
        </div>
        <p>
          <Trans>
            Keep it on and we will not ask again. The settings page shows the
            same report, the occasional extra detail, and the off switch.
          </Trans>
        </p>
      </div>
    </Modal>
  )
}

export default TelemetryConsentModal
