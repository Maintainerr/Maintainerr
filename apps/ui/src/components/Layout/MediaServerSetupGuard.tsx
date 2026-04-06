import { MediaServerType } from '@maintainerr/contracts'
import { useCallback } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useMediaServerType } from '../../hooks/useMediaServerType'
import LoadingSpinner from '../Common/LoadingSpinner'

export const bypassMediaServerSetupGuard =
  import.meta.env.MODE === 'development' &&
  import.meta.env.VITE_BYPASS_MEDIA_SERVER_SETUP_GUARD !== 'false'

export const mediaServerSetupRequiredToastId = 'media-server-setup-required'

export const mediaServerSetupRequiredMessage =
  'You need to set up the media server first.'

export const getMediaServerSetupRoute = (
  mediaServerType?: MediaServerType | null,
) => {
  if (mediaServerType === MediaServerType.JELLYFIN) {
    return '/settings/jellyfin'
  }

  if (mediaServerType === MediaServerType.PLEX) {
    return '/settings/plex'
  }

  return '/settings/main'
}

export const isAllowedDuringMediaServerSetup = (
  pathname: string,
  mediaServerType?: MediaServerType | null,
) => {
  const setupRoute = getMediaServerSetupRoute(mediaServerType)

  return (
    pathname === '/settings' ||
    pathname.startsWith('/settings/main') ||
    pathname.startsWith('/settings/logs') ||
    (setupRoute !== '/settings/main' && pathname.startsWith(setupRoute))
  )
}

export const showMediaServerSetupRequiredToast = () => {
  if (bypassMediaServerSetupGuard) {
    return
  }

  toast.error(mediaServerSetupRequiredMessage, {
    toastId: mediaServerSetupRequiredToastId,
  })
}

export const useMediaServerSetupNavigationGuard = () => {
  const { isLoading, isNotConfigured, mediaServerType } = useMediaServerType()

  const isRouteBlocked = useCallback(
    (pathname: string) => {
      if (bypassMediaServerSetupGuard) {
        return false
      }

      return (
        !isLoading &&
        isNotConfigured &&
        !isAllowedDuringMediaServerSetup(pathname, mediaServerType)
      )
    },
    [isLoading, isNotConfigured, mediaServerType],
  )

  return {
    isLoading,
    isNotConfigured,
    mediaServerType,
    isRouteBlocked,
    showBlockedNavigationToast: showMediaServerSetupRequiredToast,
  }
}

const MediaServerSetupGuard = () => {
  const { isLoading, isNotConfigured, mediaServerType } =
    useMediaServerSetupNavigationGuard()

  const setupRoute = getMediaServerSetupRoute(mediaServerType)

  if (bypassMediaServerSetupGuard) {
    return <Outlet />
  }

  if (isLoading) {
    return <LoadingSpinner />
  }

  if (isNotConfigured) {
    return <Navigate to={setupRoute} replace />
  }

  return <Outlet />
}

export default MediaServerSetupGuard
