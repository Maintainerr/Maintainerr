import { Outlet, useOutletContext } from 'react-router-dom'
import { useSettings, type UseSettingsResult } from '../../api/settings'
import Alert from '../Common/Alert'
import LoadingSpinner from '../Common/LoadingSpinner'
import SettingsTabs, { SettingsRoute } from './Tabs'

export type SettingsOutletContext = {
  settings: NonNullable<UseSettingsResult['data']>
}

export const useSettingsOutletContext = () =>
  useOutletContext<SettingsOutletContext>()

const SettingsWrapper = () => {
  const { data: settings, isLoading, error } = useSettings()

  const settingsRoutes: SettingsRoute[] = [
    {
      text: 'General',
      route: '/settings/main',
      regex: /^\/settings\/main$/,
    },
    {
      text: 'Plex',
      route: '/settings/plex',
      regex: /^\/settings\/plex$/,
    },
    {
      text: 'Overseerr',
      route: '/settings/overseerr',
      regex: /^\/settings\/overseerr$/,
    },
    {
      text: 'Jellyseerr',
      route: '/settings/jellyseerr',
      regex: /^\/settings\/jellyseerr$/,
    },
    {
      text: 'Radarr',
      route: '/settings/radarr',
      regex: /^\/settings\/radarr$/,
    },
    {
      text: 'Sonarr',
      route: '/settings/sonarr',
      regex: /^\/settings\/sonarr$/,
    },
    {
      text: 'Tautulli',
      route: '/settings/tautulli',
      regex: /^\/settings\/tautulli$/,
    },
    {
      text: 'Notifications',
      route: '/settings/notifications',
      regex: /^\/settings\/notifications$/,
    },
    {
      text: 'Logs',
      route: '/settings/logs',
      regex: /^\/settings\/logs$/,
    },
    {
      text: 'Jobs',
      route: '/settings/jobs',
      regex: /^\/settings\/jobs$/,
    },
    {
      text: 'About',
      route: '/settings/about',
      regex: /^\/settings\/about$/,
    },
  ]

  if (error) {
    return (
      <>
        <div className="mt-6">
          <SettingsTabs settingsRoutes={settingsRoutes} allEnabled={false} />
        </div>
        <div className="mt-10 flex">
          <Alert type="error" title="There was a problem loading settings." />
        </div>
      </>
    )
  }

  if (isLoading) {
    return (
      <>
        <div className="mt-6">
          <SettingsTabs settingsRoutes={settingsRoutes} allEnabled={false} />
        </div>
        <LoadingSpinner />
      </>
    )
  }

  if (settings) {
    return (
      <>
        <div className="mt-6">
          <SettingsTabs
            settingsRoutes={settingsRoutes}
            allEnabled={settings.plex_auth_token !== null}
          />
        </div>
        <div className="mt-10 text-white">
          <Outlet context={{ settings }} />
        </div>
      </>
    )
  }

  return null
}
export default SettingsWrapper
