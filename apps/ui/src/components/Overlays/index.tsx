import { useMemo } from 'react'
import { Outlet } from 'react-router-dom'
import SettingsTabs, { SettingsRoute } from '../Settings/Tabs'

const OverlaysWrapper = () => {
  const routes: SettingsRoute[] = useMemo(
    () => [
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
    ],
    [],
  )

  return (
    <>
      <div className="mt-6">
        <SettingsTabs settingsRoutes={routes} allEnabled />
      </div>
      <div className="mt-10 text-white">
        <Outlet />
      </div>
    </>
  )
}

export default OverlaysWrapper
