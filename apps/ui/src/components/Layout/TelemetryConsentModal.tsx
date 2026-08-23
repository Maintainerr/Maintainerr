import { Trans, useLingui } from '@lingui/react/macro'
import { useSettings, useUpdateTelemetrySetting } from '../../api/settings'
import { hasCompletedMediaServerSetup } from '../../hooks/useMediaServerType'
import BrandLink from '../Common/BrandLink'
import Button from '../Common/Button'
import Modal from '../Common/Modal'

const TELEMETRY_SETTINGS_ROUTE = '/settings/telemetry'

/**
 * Telemetry is stored as null - "not answered yet" - on every install, and
 * reports until it is turned off, so this prompt is the opt-out. The ask waits
 * for media server setup to finish: a fresh install lands on null immediately,
 * and interrupting onboarding to ask only earns a reflex answer.
 */
const TelemetryConsentModal = () => {
  const { t } = useLingui()
  const { data: settings } = useSettings()
  const { mutateAsync: updateTelemetrySetting, isPending } =
    useUpdateTelemetrySetting()

  if (
    settings?.telemetryEnabled !== null ||
    !hasCompletedMediaServerSetup(settings)
  ) {
    return null
  }

  const answer = async (enabled: boolean) => {
    try {
      await updateTelemetrySetting(enabled)
    } catch {
      // Leaving the setting unanswered simply shows the prompt again, so there
      // is nothing to recover from here.
    }
  }

  return (
    <Modal
      title={t`Help shape Maintainerr?`}
      backgroundClickable={false}
      loading={isPending}
      size="lg"
      cancelText={t`Turn it off`}
      onCancel={() => void answer(false)}
      footerActions={
        <Button
          buttonType="primary"
          className="ml-3"
          onClick={() => void answer(true)}
        >
          <Trans>Keep it on</Trans>
        </Button>
      }
    >
      <div className="space-y-2">
        <p>
          <Trans>
            Maintainerr reports a weekly count of which version it runs and
            roughly which features get used, so development follows what people
            actually run. Nothing identifies your server, and no IP address is
            read or stored.
          </Trans>
        </p>
        <p>
          <Trans>
            It is on, and you can turn it off right here. Maintainerr is built
            in our spare time and the server bill comes out of our own pockets,
            so leaving it on is a free way to help. Either way you are only
            asked once, and you can change your mind and see exactly what is
            sent under{' '}
            <BrandLink to={TELEMETRY_SETTINGS_ROUTE}>
              About, Help us improve it
            </BrandLink>
            .
          </Trans>
        </p>
      </div>
    </Modal>
  )
}

export default TelemetryConsentModal
