import { MediaServerType } from '@maintainerr/contracts'
import { useEffect, useMemo, useState } from 'react'
import {
  Navigate,
  Outlet,
  useLocation,
  useOutletContext,
} from 'react-router-dom'
import { useSettings, type UseSettingsResult } from '../../api/settings'
import {
  hasCompletedMediaServerSetup,
  hasSelectedMediaServerType,
} from '../../hooks/useMediaServerType'
import Alert from '../Common/Alert'
import Button from '../Common/Button'
import LoadingSpinner from '../Common/LoadingSpinner'
import Modal from '../Common/Modal'
import {
  bypassMediaServerSetupGuard,
  getMediaServerSetupRoute,
  isAllowedDuringMediaServerSetup,
  showMediaServerSetupRequiredToast,
} from '../Layout/MediaServerSetupGuard'
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
      activeRegex: /^\/settings\/__placeholder__$/,
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
  const [hasDismissedSetupWelcome, setHasDismissedSetupWelcome] =
    useState(false)

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
        text: 'Overlays',
        route: '/settings/overlays',
        regex: /^\/settings\/overlays$/,
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

  const isMediaServerSetupComplete = hasCompletedMediaServerSetup(settings)
  const hasSelectedMediaServer = hasSelectedMediaServerType(settings)
  const isSetupRestrictedRoute =
    !bypassMediaServerSetupGuard && !isLoading && !isMediaServerSetupComplete
  const setupRoute = getMediaServerSetupRoute(mediaServerType)
  const isAllowedRoute = isAllowedDuringMediaServerSetup(
    location.pathname,
    mediaServerType,
  )
  const shouldShowSetupWelcome =
    isSetupRestrictedRoute &&
    !hasSelectedMediaServer &&
    isAllowedRoute &&
    !hasDismissedSetupWelcome

  useEffect(() => {
    if (isSetupRestrictedRoute && !isAllowedRoute) {
      showMediaServerSetupRequiredToast()
    }
  }, [isAllowedRoute, isSetupRestrictedRoute])

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

  if (isSetupRestrictedRoute && !isAllowedRoute) {
    return <Navigate to={setupRoute} replace />
  }

  if (settings) {
    const routeIsDisabled = (route: SettingsRoute) => {
      return (
        !bypassMediaServerSetupGuard &&
        !isMediaServerSetupComplete &&
        !isAllowedDuringMediaServerSetup(route.route, mediaServerType)
      )
    }

    return (
      <>
        {shouldShowSetupWelcome ? (
          <Modal
            title="Welcome to Maintainerr!"
            backgroundClickable={false}
            size="md"
            footerActions={
              <Button
                buttonType="primary"
                className="ml-3"
                onClick={() => setHasDismissedSetupWelcome(true)}
              >
                Let&apos;s get started
              </Button>
            }
          >
            <div className="space-y-4 text-zinc-100">
              <div className="rounded-md border border-info-500/40 bg-info-900/30 p-4 backdrop-blur">
                <p className="text-base font-medium text-info-100">
                  Connect your media server to finish setup.
                </p>
                <p className="mt-2 leading-6 text-info-200">
                  Choose Plex or Jellyfin, confirm the connection, and then you
                  can continue configuring the rest of Maintainerr.
                </p>
              </div>
              <p className="text-sm leading-6 text-zinc-400">
                The Logs page stays available during setup if you need to
                troubleshoot your connection.
              </p>
            </div>
          </Modal>
        ) : null}
        <div className="mt-6">
          <SettingsTabs
            settingsRoutes={settingsRoutes}
            allEnabled
            isRouteDisabled={routeIsDisabled}
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
