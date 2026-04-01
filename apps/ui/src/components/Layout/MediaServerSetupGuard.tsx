import { useCallback, useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useMediaServerType } from '../../hooks/useMediaServerType'
import LoadingSpinner from '../Common/LoadingSpinner'

export const mediaServerSetupRequiredToastId = 'media-server-setup-required'

export const mediaServerSetupRequiredMessage =
  'You need to set up the media server first.'

export const isAllowedDuringMediaServerSetup = (pathname: string) => {
  return pathname === '/settings' || pathname.startsWith('/settings/main')
}

export const showMediaServerSetupRequiredToast = () => {
  toast.error(mediaServerSetupRequiredMessage, {
    toastId: mediaServerSetupRequiredToastId,
  })
}

export const useMediaServerSetupNavigationGuard = () => {
  const { isLoading, isNotConfigured } = useMediaServerType()

  const isRouteBlocked = useCallback(
    (pathname: string) => {
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
  const { isLoading, isNotConfigured, showBlockedNavigationToast } =
    useMediaServerSetupNavigationGuard()

  useEffect(() => {
    if (!isLoading && isNotConfigured) {
      showBlockedNavigationToast()
    }
  }, [isLoading, isNotConfigured, showBlockedNavigationToast])

  if (isLoading) {
    return <LoadingSpinner />
  }

  if (isNotConfigured) {
    return <Navigate to="/settings/main" replace />
  }

  return <Outlet />
}

export default MediaServerSetupGuard
