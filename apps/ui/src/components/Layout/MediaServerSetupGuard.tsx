import { t } from '@lingui/core/macro'
import { useCallback } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useMediaServerType } from '../../hooks/useMediaServerType'
import LoadingSpinner from '../Common/LoadingSpinner'

export const bypassMediaServerSetupGuard =
  import.meta.env.MODE === 'development' &&
  import.meta.env.VITE_BYPASS_MEDIA_SERVER_SETUP_GUARD !== 'false'

export const mediaServerSetupRequiredToastId = 'media-server-setup-required'

// A function rather than a constant: translating at module load would freeze
// the message in whichever locale happened to be active on first import.
export const mediaServerSetupRequiredMessage = () =>
  t`You need to set up the media server first.`

export const mediaServerSetupRoute = '/services/media-server'

// Only the media server page and Logs work before a server is connected. The
// two section entries stay open so the sidebar can still lead to them.
export const isAllowedDuringMediaServerSetup = (pathname: string) =>
  pathname === '/settings' ||
  pathname === '/services' ||
  pathname.startsWith('/settings/logs') ||
  pathname.startsWith(mediaServerSetupRoute)

export const showMediaServerSetupRequiredToast = () => {
  if (bypassMediaServerSetupGuard) {
    return
  }

  toast.error(mediaServerSetupRequiredMessage(), {
    toastId: mediaServerSetupRequiredToastId,
  })
}

export const useMediaServerSetupNavigationGuard = () => {
  const { isLoading, isNotConfigured } = useMediaServerType()

  const isRouteBlocked = useCallback(
    (pathname: string) => {
      if (bypassMediaServerSetupGuard) {
        return false
      }

      return (
        !isLoading &&
        isNotConfigured &&
        !isAllowedDuringMediaServerSetup(pathname)
      )
    },
    [isLoading, isNotConfigured],
  )

  return {
    isLoading,
    isNotConfigured,
    isRouteBlocked,
    showBlockedNavigationToast: showMediaServerSetupRequiredToast,
  }
}

const MediaServerSetupGuard = () => {
  const { isLoading, isNotConfigured } = useMediaServerSetupNavigationGuard()

  if (bypassMediaServerSetupGuard) {
    return <Outlet />
  }

  if (isLoading) {
    return <LoadingSpinner />
  }

  if (isNotConfigured) {
    return <Navigate to={mediaServerSetupRoute} replace />
  }

  return <Outlet />
}

export default MediaServerSetupGuard
