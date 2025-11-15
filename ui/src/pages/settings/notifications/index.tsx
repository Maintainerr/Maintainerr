import { NextPage } from 'next'
import SettingsWrapper from '../../../components/Settings'
import NotificationSettings from '../../../components/Settings/Notifications'

const SettingsOverseerr: NextPage = () => {
  return (
    <SettingsWrapper>
      <NotificationSettings />
    </SettingsWrapper>
  )
}

export default SettingsOverseerr
