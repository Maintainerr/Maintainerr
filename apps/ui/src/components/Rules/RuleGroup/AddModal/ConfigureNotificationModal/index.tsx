import { Trans, useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import {
  type AgentConfiguration,
  useNotificationConfigurations,
} from '../../../../../api/notifications'
import Alert from '../../../../Common/Alert'
import Button from '../../../../Common/Button'
import { SmallLoadingSpinner } from '../../../../Common/LoadingSpinner'
import Modal from '../../../../Common/Modal'
import ToggleItem from '../../../../Common/ToggleButton'

interface ConfigureNotificationModal {
  onCancel: () => void
  onSuccess: (selectedConfigurations: AgentConfiguration[]) => void
  selectedAgents?: AgentConfiguration[]
}
const ConfigureNotificationModal = (props: ConfigureNotificationModal) => {
  const { t } = useLingui()
  const {
    data: notifications,
    isLoading,
    isError,
  } = useNotificationConfigurations()
  const [activatedNotifications, setActivatedNotifications] = useState<
    AgentConfiguration[]
  >(props.selectedAgents ?? [])

  return (
    <Modal
      backgroundClickable={false}
      onCancel={() => props.onCancel()}
      title={t`Notification Agents`}
      iconSvg={''}
      footerActions={
        <Button
          buttonType="primary"
          className="ml-3"
          disabled={isLoading}
          onClick={() => props.onSuccess(activatedNotifications)}
        >
          <Trans>OK</Trans>
        </Button>
      }
    >
      <div>
        <form className="space-y-4">
          {/* Config Name */}
          <div className="form-row">
            <label htmlFor="name" className="text-label">
              <Trans>Agents</Trans>
            </label>
            <div className="form-input">
              <div className="form-input-field flex flex-col gap-2">
                {/* Immediate: the delayed spinner may just have shown for
                    the chunk, and a fresh one would restart its timer. */}
                {isLoading && <SmallLoadingSpinner className="h-6 w-6" />}
                {isError && !notifications && (
                  <Alert
                    type="error"
                    title={t`The notification agents could not be loaded.`}
                  />
                )}
                {notifications?.map((n) => (
                  <ToggleItem
                    key={n.id}
                    label={
                      n.enabled
                        ? `${n.name} - ${n.agent}`
                        : t`${{ agentName: n.name }} - ${{ agentType: n.agent }} (disabled)`
                    }
                    toggled={
                      activatedNotifications.find((an) => an.id === n.id)
                        ? true
                        : false
                    }
                    onStateChange={(state) => {
                      if (state) {
                        setActivatedNotifications([
                          ...activatedNotifications,
                          n,
                        ])
                      } else {
                        setActivatedNotifications([
                          ...activatedNotifications.filter(
                            (el) => el.id !== n.id,
                          ),
                        ])
                      }
                    }}
                  />
                ))}
                {notifications?.length === 0 && (
                  <p className="text-zinc-400">
                    <Trans>No notification agents configured.</Trans>
                  </p>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  )
}
export default ConfigureNotificationModal
