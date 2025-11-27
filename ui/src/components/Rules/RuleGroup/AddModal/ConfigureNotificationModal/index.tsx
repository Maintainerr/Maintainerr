import { useEffect, useState } from 'react'
import GetApiHandler from '../../../../../utils/ApiHandler'
import Modal from '../../../../Common/Modal'
import ToggleItem from '../../../../Common/ToggleButton'
import { AgentConfiguration } from '../../../../Settings/Notifications/CreateNotificationModal'

interface ConfigureNotificationModal {
  onCancel: () => void
  onSuccess: (selectedConfigurations: AgentConfiguration[]) => void
  selectedAgents?: AgentConfiguration[]
}
const ConfigureNotificationModal = (props: ConfigureNotificationModal) => {
  const [notifications, setNotifications] = useState<AgentConfiguration[]>()
  const [activatedNotifications, setActivatedNotifications] = useState<
    AgentConfiguration[]
  >([])
  const [isLoading, setIsloading] = useState(true)

  useEffect(() => {
    GetApiHandler('/notifications/configurations').then(
      (notificationConfigs) => {
        setNotifications(notificationConfigs)
        if (props.selectedAgents) {
          setActivatedNotifications(props.selectedAgents)
        }
        setIsloading(false)
      },
    )
  }, [])

  return (
    <Modal
      loading={isLoading}
      backgroundClickable={false}
      onCancel={() => props.onCancel()}
      okDisabled={false}
      onOk={() => props.onSuccess(activatedNotifications)}
      okText={'OK'}
      okButtonType={'primary'}
      title={'Notification Agents'}
      iconSvg={''}
    >
      <div>
        <form className="space-y-4">
          {/* Config Name */}
          <div className="form-row">
            <label htmlFor="name" className="text-label">
              Agents
            </label>
            <div className="form-input">
              <div className="form-input-field flex flex-col gap-2">
                {!isLoading &&
                  notifications!.map((n) => (
                    <ToggleItem
                      key={n.id}
                      label={`${n.name} - ${n.agent} ${!n.enabled ? ' (disabled)' : ''}`}
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
              </div>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  )
}
export default ConfigureNotificationModal
