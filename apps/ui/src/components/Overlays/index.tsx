import { t as globalT } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useCallback } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useOverlaySettings } from '../../api/overlays'
import { useMediaServerType } from '../../hooks/useMediaServerType'
import LoadingSpinner from '../Common/LoadingSpinner'
import SettingsTabs, { SettingsRoute } from '../Settings/Tabs'

const overlaysDisabledToastId = 'overlays-disabled'

const showOverlaysDisabledToast = () => {
  toast.error(globalT`Enable overlays in Settings to manage templates.`, {
    toastId: overlaysDisabledToastId,
  })
}

// Overlays are supported on both Plex and Jellyfin. The router-level
// MediaServerSetupGuard keeps unconfigured users out entirely. The wrapper
// then mirrors the first-setup gating pattern (see SettingsWrapper): when
// the overlay master switch is off, only the Settings tab stays clickable;
// templates routes are disabled and any direct navigation redirects back.
const OverlaysWrapper = () => {
  const { t } = useLingui()
  const { isLoading: isMediaServerLoading } = useMediaServerType()
  const location = useLocation()
  const { data: overlaySettings, isLoading: isOverlaySettingsLoading } =
    useOverlaySettings()

  // Rebuilt each render rather than memoized, so a language switch relabels
  // the tabs.
  const overlayRoutes: SettingsRoute[] = [
    {
      text: t`Settings`,
      route: '/overlays/settings',
      regex: /^\/overlays\/settings$/,
    },
    {
      text: t`Existing Templates`,
      route: '/overlays/templates',
      regex: /^\/overlays\/templates$/,
      activeRegex: /^\/overlays\/templates(?:\/(?!new$).+)?$/,
    },
    {
      text: t`New Template`,
      route: '/overlays/templates/new',
      regex: /^\/overlays\/templates\/new$/,
    },
  ]
  const overlaysEnabled = overlaySettings?.enabled === true
  const isLoading = isMediaServerLoading || isOverlaySettingsLoading

  const isTemplatesPath = location.pathname.startsWith('/overlays/templates')
  const shouldRedirectFromTemplates =
    !isLoading && !overlaysEnabled && isTemplatesPath

  const isRouteDisabled = useCallback(
    (route: SettingsRoute) => {
      if (overlaysEnabled) return false
      return route.route !== '/overlays/settings'
    },
    [overlaysEnabled],
  )

  return (
    <>
      <div className="mt-6">
        <SettingsTabs
          settingsRoutes={overlayRoutes}
          allEnabled
          isRouteDisabled={isRouteDisabled}
          onBlockedNavigate={showOverlaysDisabledToast}
        />
      </div>
      <div className="mt-10 min-h-64 text-white">
        {isLoading ? (
          <LoadingSpinner containerClassName="min-h-64" />
        ) : shouldRedirectFromTemplates ? (
          <Navigate to="/overlays/settings" replace />
        ) : (
          <Outlet />
        )}
      </div>
    </>
  )
}

export { showOverlaysDisabledToast }
export default OverlaysWrapper
