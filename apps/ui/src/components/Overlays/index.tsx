import { Outlet } from 'react-router-dom'
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

// Overlays are supported on both Plex and Jellyfin. The router-level
// MediaServerSetupGuard keeps unconfigured users out entirely, so we only
// need to handle the short loading window before the server-type hook
// resolves.
const OverlaysWrapper = () => {
  const { isLoading } = useMediaServerType()

  return (
    <>
      <div className="mt-6">
        <SettingsTabs settingsRoutes={overlayRoutes} allEnabled />
      </div>
      <div className="mt-10 min-h-[16rem] text-white">
        {isLoading ? (
          <LoadingSpinner containerClassName="min-h-[16rem]" />
        ) : (
          <Outlet />
        )}
      </div>
    </>
  )
}

export default OverlaysWrapper
