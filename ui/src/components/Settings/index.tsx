import { ReactNode, useContext, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import SettingsContext from '../../contexts/settings-context'
import GetApiHandler from '../../utils/ApiHandler'
import LoadingSpinner from '../Common/LoadingSpinner'
import SettingsTabs, { SettingsRoute } from './Tabs'

const SettingsWrapper: React.FC<{ children?: ReactNode }> = (props: {
  children?: ReactNode
}) => {
  const settingsCtx = useContext(SettingsContext)
  const [loaded, setLoaded] = useState(false)

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

  useEffect(() => {
    if (settingsCtx.settings?.id === undefined) {
      GetApiHandler('/settings').then((resp) => {
        settingsCtx.addSettings(resp)
        setLoaded(true)
      })
    } else {
      setLoaded(true)
    }
  }, [])

  if (loaded) {
    return (
      <>
        <div className="mt-6">
          <SettingsTabs
            settingsRoutes={settingsRoutes}
            allEnabled={settingsCtx.settings.plex_auth_token !== null}
          />
        </div>
        <div className="mt-10 text-white">
          {props.children || <Outlet />}
        </div>
      </>
    )
  } else {
    return (
      <>
        <div className="mt-6">
          <LoadingSpinner />
        </div>
      </>
    )
  }
}
export default SettingsWrapper
