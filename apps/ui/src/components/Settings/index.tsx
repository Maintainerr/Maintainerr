import { MediaServerType } from '@maintainerr/contracts'
import { useMemo } from 'react'
import { Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { useSettings, type UseSettingsResult } from '../../api/settings'
import Alert from '../Common/Alert'
import LoadingSpinner from '../Common/LoadingSpinner'
import SettingsTabs, { SettingsRoute } from './Tabs'

const mediaServerTabContent = (label?: string) => {
  if (label) {
    return <span className="inline-block min-w-16 text-center">{label}</span>
  }

  return (
    <span aria-hidden className="invisible inline-block min-w-16 text-center">
      Jellyfin
    </span>
  )
}

const getMediaServerTypeFromPath = (
  pathname: string,
): MediaServerType | undefined => {
  if (pathname.startsWith('/settings/jellyfin')) {
    return MediaServerType.JELLYFIN
  }

  if (
    pathname.startsWith('/settings/plex') ||
    pathname.startsWith('/settings/tautulli')
  ) {
    return MediaServerType.PLEX
  }

  return undefined
}

const getMediaServerRoute = (
  mediaServerType: MediaServerType | null | undefined,
  isLoading: boolean,
): SettingsRoute | undefined => {
  if (mediaServerType === MediaServerType.JELLYFIN) {
    return {
      text: 'Jellyfin',
      content: mediaServerTabContent('Jellyfin'),
      route: '/settings/jellyfin',
      regex: /^\/settings\/jellyfin$/,
    }
  }

  if (mediaServerType === MediaServerType.PLEX) {
    return {
      text: 'Plex',
      content: mediaServerTabContent('Plex'),
      route: '/settings/plex',
      regex: /^\/settings\/plex$/,
    }
  }

  if (isLoading) {
    return {
      text: '',
      content: mediaServerTabContent(),
      // Reuse the General route while loading so the tab slot stays reserved
      // without showing a wider temporary label that shifts later tabs.
      route: '/settings/main',
      regex: /^\/settings\/main$/,
    }
  }

  return undefined
}

export type SettingsOutletContext = {
  settings: NonNullable<UseSettingsResult['data']>
}

export const useSettingsOutletContext = () =>
  useOutletContext<SettingsOutletContext>()

const SettingsWrapper = () => {
  const location = useLocation()
  const { data: settings, isLoading, error } = useSettings()

  // Determine which media server tab to show based on settings
  const mediaServerType =
    settings?.media_server_type ??
    (isLoading ? getMediaServerTypeFromPath(location.pathname) : undefined)

  const settingsRoutes: SettingsRoute[] = useMemo(() => {
    const baseRoutes: SettingsRoute[] = [
      {
        text: 'General',
        route: '/settings/main',
        regex: /^\/settings\/main$/,
      },
    ]

    const mediaServerRoute = getMediaServerRoute(mediaServerType, isLoading)
    if (mediaServerRoute) {
      baseRoutes.push(mediaServerRoute)
    }

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
      {
        text: 'Metadata',
        route: '/settings/metadata',
        regex: /^\/settings\/metadata$/,
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
  }, [isLoading, mediaServerType])

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
