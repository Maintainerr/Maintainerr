import { MediaServerType } from '@maintainerr/contracts'
import { useMemo } from 'react'
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

  // Determine which media server tab to show based on settings
  const mediaServerType = settings?.media_server_type

  const settingsRoutes: SettingsRoute[] = useMemo(() => {
    const baseRoutes: SettingsRoute[] = [
      {
        text: 'General',
        route: '/settings/main',
        regex: /^\/settings\/main$/,
      },
    ]

    // Only show media server tab after user has selected a type
    // During initial setup, user selects via MediaServerSelector in General tab
    if (mediaServerType === MediaServerType.JELLYFIN) {
      baseRoutes.push({
        text: 'Jellyfin',
        route: '/settings/jellyfin',
        regex: /^\/settings\/jellyfin$/,
      })
    } else if (mediaServerType === MediaServerType.PLEX) {
      baseRoutes.push({
        text: 'Plex',
        route: '/settings/plex',
        regex: /^\/settings\/plex$/,
      })
    }
    // When no mediaServerType is set, don't show either tab
    // User must select via MediaServerSelector in General settings

    // Add remaining tabs
    baseRoutes.push(
      {
        text: 'Seerr',
        route: '/settings/seerr',
        regex: /^\/settings\/seerr$/,
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
    )

    // Tautulli is a Plex-only integration
    if (mediaServerType === MediaServerType.PLEX) {
      baseRoutes.push({
        text: 'Tautulli',
        route: '/settings/tautulli',
        regex: /^\/settings\/tautulli$/,
      })
    }

    baseRoutes.push(
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
    )

    return baseRoutes
  }, [mediaServerType])

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
    // Allow access if either Plex or Jellyfin is configured
    const isMediaServerConfigured = Boolean(
      settings.plex_auth_token !== null ||
      (settings.jellyfin_url && settings.jellyfin_api_key),
    )

    return (
      <>
        <div className="mt-6">
          <SettingsTabs
            settingsRoutes={settingsRoutes}
            allEnabled={isMediaServerConfigured}
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
