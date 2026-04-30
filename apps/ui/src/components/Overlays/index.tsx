import { useCallback } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useOverlaySettings } from '../../api/overlays'
import { useMediaServerType } from '../../hooks/useMediaServerType'
import LoadingSpinner from '../Common/LoadingSpinner'
import SettingsTabs, { SettingsRoute } from '../Settings/Tabs'

const overlayRoutes: SettingsRoute[] = [
  {
    text: 'Settings',
    route: '/overlays/settings',
    regex: /^\/overlays\/settings$/,
  },
  {
    text: 'Existing Templates',
    route: '/overlays/templates',
    regex: /^\/overlays\/templates$/,
    activeRegex: /^\/overlays\/templates(?:\/(?!new$).+)?$/,
  },
  {
    text: 'New Template',
    route: '/overlays/templates/new',
    regex: /^\/overlays\/templates\/new$/,
  },
]

const overlaysDisabledToastId = 'overlays-disabled'
const overlaysDisabledMessage =
  'Enable overlays in Settings to manage templates.'

const showOverlaysDisabledToast = () => {
  toast.error(overlaysDisabledMessage, {
    toastId: overlaysDisabledToastId,
  })
}

// Overlays are supported on both Plex and Jellyfin. The router-level
// MediaServerSetupGuard keeps unconfigured users out entirely. The wrapper
// then mirrors the first-setup gating pattern (see SettingsWrapper): when
// the overlay master switch is off, only the Settings tab stays clickable;
// templates routes are disabled and any direct navigation redirects back.
const OverlaysWrapper = () => {
  const { isLoading: isMediaServerLoading } = useMediaServerType()
  const location = useLocation()
  const { data: overlaySettings, isLoading: isOverlaySettingsLoading } =
    useOverlaySettings()

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

  // Mobile uses a native <select> for tab navigation, where iOS Safari just
  // greys out disabled options without firing onChange — so a tap that lands
  // on a locked route gives the user no signal at all (no toast either,
  // since onChange never runs). A persistent inline notice keeps the
  // disabled state visible without depending on transient feedback.
  const showDisabledHint = !isLoading && !overlaysEnabled

  return (
    <>
      <div className="mt-6">
        <SettingsTabs
          settingsRoutes={overlayRoutes}
          allEnabled
          isRouteDisabled={isRouteDisabled}
          onBlockedNavigate={showOverlaysDisabledToast}
        />
        {showDisabledHint && (
          <p className="mt-2 text-xs text-zinc-400">
            Templates are locked until overlays are enabled below.
          </p>
        )}
      </div>
      <div className="mt-10 min-h-[16rem] text-white">
        {isLoading ? (
          <LoadingSpinner containerClassName="min-h-[16rem]" />
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
