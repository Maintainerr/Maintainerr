import { ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { useSettings } from '../../api/settings'
import Alert from '../Common/Alert'
import LoadingSpinner from '../Common/LoadingSpinner'
import SettingsTabs, { SettingsRoute } from './Tabs'

const SettingsWrapper: React.FC<{ children?: ReactNode }> = (props: {
  children?: ReactNode
}) => {
  const { data: settings, isLoading, error } = useSettings()

  const settingsRoutes: SettingsRoute[] = [
    {
      text: 'General',
      route: '/settings/main',
      regex: /^\/settings(\/main)?$/,
    },
    {
      text: 'Plex',
      route: '/settings/plex',
      regex: /^\/settings(\/plex)?$/,
    },
    {
      text: 'Overseerr',
      route: '/settings/overseerr',
      regex: /^\/settings(\/overseerr)?$/,
    },
    {
      text: 'Jellyseerr',
      route: '/settings/jellyseerr',
      regex: /^\/settings(\/jellyseerr)?$/,
    },
    {
      text: 'Radarr',
      route: '/settings/radarr',
      regex: /^\/settings(\/radarr)?$/,
    },
    {
      text: 'Sonarr',
      route: '/settings/sonarr',
      regex: /^\/settings(\/sonarr)?$/,
    },
    {
      text: 'Tautulli',
      route: '/settings/tautulli',
      regex: /^\/settings(\/tautulli)?$/,
    },
    {
      text: 'Notifications',
      route: '/settings/notifications',
      regex: /^\/settings(\/notifications)?$/,
    },
    {
      text: 'Logs',
      route: '/settings/logs',
      regex: /^\/settings(\/logs)?$/,
    },
    {
      text: 'Jobs',
      route: '/settings/jobs',
      regex: /^\/settings(\/jobs)?$/,
    },
    {
      text: 'About',
      route: '/settings/about',
      regex: /^\/settings(\/about)?$/,
    },
  ]

  if (error) {
    return (
      <>
        <div className="mt-6">
          <SettingsTabs settingsRoutes={settingsRoutes} allEnabled={true} />
        </div>
        <div className="mt-10 flex">
          <Alert type="error" title="There was a problem loading settings." />
        </div>
      </>
    )
  }

  if (isLoading) {
    return (
      <div className="mt-6">
        <LoadingSpinner />
      </div>
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
        <div className="mt-10 text-white">{props.children || <Outlet />}</div>
      </>
    )
  }
}
export default SettingsWrapper
