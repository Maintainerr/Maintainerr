import { Link, useLocation, useNavigate } from 'react-router-dom'
import React, { ReactNode, useEffect } from 'react'

export interface SettingsRoute {
  text: string
  content?: React.ReactNode
  route: string
  regex: RegExp
}
export interface ISettingsLink {
  tabType: 'default' | 'button'
  currentPath: string
  route: string
  regex: RegExp
  hidden?: boolean
  isMobile?: boolean
  disabled?: boolean
  children?: ReactNode
}

const SettingsLink: React.FC<ISettingsLink> = (props: ISettingsLink) => {
  if (props.isMobile) {
    return (
      <option disabled={props.disabled} value={props.route}>
        {props.children}
      </option>
    )
  }

  let linkClasses =
    (props.disabled ? 'pointer-events-none touch-none ' : '') +
    'px-1 py-4 ml-8 text-sm font-medium leading-5 transition duration-300 border-b-2  whitespace-nowrap first:ml-0'
  let activeLinkColor = 'text-amber-500 border-amber-600 border-b'
  let inactiveLinkColor =
    'text-zinc-500 border-transparent hover:text-zinc-300 hover:border-zinc-400 focus:text-zinc-300 focus:border-zinc-400'

  if (props.tabType === 'button') {
    linkClasses =
      'px-3 py-2 text-sm font-medium transition duration-300 rounded-md whitespace-nowrap mx-2 my-1'
    activeLinkColor = 'bg-amber-700'
    inactiveLinkColor = 'bg-zinc-800 hover:bg-zinc-700 focus:bg-zinc-700'
  }

  return (
    <Link
      to={props.route}
      className={`${linkClasses} ${
        props.currentPath.match(props.regex)
          ? activeLinkColor
          : inactiveLinkColor
      }`}
      aria-current="page"
    >
      {props.children}
    </Link>
  )
}

const SettingsTabs: React.FC<{
  tabType?: 'default' | 'button'
  settingsRoutes: SettingsRoute[]
  allEnabled?: boolean
}> = ({ tabType = 'default', settingsRoutes, allEnabled = true }) => {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (!allEnabled) {
        e.preventDefault()
      }
    }
    window.addEventListener('touchstart', handleTouchStart)
    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
    }
  }, [allEnabled])

  return (
    <>
      <div className="sm:hidden">
        <label htmlFor="tabs" className="sr-only">
          Select a Tab
        </label>
        <select
          onChange={(e) => {
            navigate(e.target.value)
          }}
          onBlur={(e) => {
            navigate(e.target.value)
          }}
          defaultValue={
            settingsRoutes.find((route) => !!location.pathname.match(route.route))
              ?.route
          }
          aria-label="Selected Tab"
        >
          {settingsRoutes.map((route, index) => (
            <SettingsLink
              disabled={!allEnabled}
              tabType={tabType}
              currentPath={location.pathname}
              route={route.route}
              regex={route.regex}
              isMobile
              key={`mobile-settings-link-${index}`}
            >
              {route.text}
            </SettingsLink>
          ))}
        </select>
      </div>
      {tabType === 'button' ? (
        <div className="hidden sm:block">
          <nav className="-mx-2 -my-1 flex flex-wrap" aria-label="Tabs">
            {settingsRoutes.map((route, index) => (
              <SettingsLink
                disabled={!allEnabled}
                tabType={tabType}
                currentPath={location.pathname}
                route={route.route}
                regex={route.regex}
                key={`button-settings-link-${index}`}
              >
                {route.content ?? route.text}
              </SettingsLink>
            ))}
          </nav>
        </div>
      ) : (
        <div className="hide-scrollbar hidden overflow-x-scroll border-b border-zinc-600 sm:block">
          <nav className="flex">
            {settingsRoutes.map((route, index) => (
              <SettingsLink
                disabled={!allEnabled}
                tabType={tabType}
                currentPath={location.pathname}
                route={route.route}
                regex={route.regex}
                key={`standard-settings-link-${index}`}
              >
                {route.text}
              </SettingsLink>
            ))}
          </nav>
        </div>
      )}
    </>
  )
}

export default SettingsTabs
