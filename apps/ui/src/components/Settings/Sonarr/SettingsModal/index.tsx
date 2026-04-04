import { ISonarrSetting } from '..'
import ServarrSettingsModal from '../../Servarr/ServarrSettingsModal'

interface ISonarrSettingsModal {
  onUpdate: (setting: ISonarrSetting) => void
  onDelete: (id: number) => Promise<boolean>
  onCancel: () => void
  settings?: ISonarrSetting
}

const SonarrSettingsModal = (props: ISonarrSettingsModal) => {
  return (
    <ServarrSettingsModal
      title="Sonarr Settings"
      docsPage="Configuration/#sonarr"
      settingsPath="/settings/sonarr"
      testPath="/settings/test/sonarr"
      serviceName="Sonarr"
      {...props}
    />
  )
}

export default SonarrSettingsModal
