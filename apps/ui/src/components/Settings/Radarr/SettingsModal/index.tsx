import { IRadarrSetting } from '..'
import ServarrSettingsModal from '../../Servarr/ServarrSettingsModal'

interface IRadarrSettingsModal {
  onUpdate: (setting: IRadarrSetting) => void
  onDelete: (id: number) => Promise<boolean>
  onCancel: () => void
  settings?: IRadarrSetting
}

const RadarrSettingsModal = (props: IRadarrSettingsModal) => {
  return (
    <ServarrSettingsModal
      title="Radarr Settings"
      docsPage="Configuration/#radarr"
      settingsPath="/settings/radarr"
      testPath="/settings/test/radarr"
      serviceName="Radarr"
      {...props}
    />
  )
}

export default RadarrSettingsModal
