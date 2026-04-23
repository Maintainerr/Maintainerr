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

const OverlaysWrapper = () => {
  const { isLoading, isPlex } = useMediaServerType()

  return (
    <>
      <div
        className={`mt-6 ${!isPlex ? 'pointer-events-none opacity-50' : ''}`}
      >
        <SettingsTabs settingsRoutes={overlayRoutes} allEnabled={isPlex} />
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
