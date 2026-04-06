import React, { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { prefetchRoute } from '../../../router'
import { showMediaServerSetupRequiredToast } from '../../Layout/MediaServerSetupGuard'

export interface SettingsRoute {
  text: string
  content?: React.ReactNode
  route: string
  regex: RegExp
  // Allows a route to render one tab target while matching active state against another pattern.
  // This is used for the loading placeholder media-server tab so it does not appear selected.
  activeRegex?: RegExp
}
export interface ISettingsLink {
  tabType: 'default' | 'button'
  currentPath: string
  route: string
  regex: RegExp
  hidden?: boolean
  isMobile?: boolean
  disabled?: boolean
  onBlockedNavigate?: () => void
  children?: ReactNode
}

const SettingsLink: React.FC<ISettingsLink> = (props: ISettingsLink) => {
  if (props.isMobile) {
    return (
      <option value={props.route} disabled={props.disabled}>
        {props.children}
      </option>
    )
  }

  let linkClasses =
    (props.disabled ? 'cursor-not-allowed opacity-50 ' : '') +
    'px-1 py-4 ml-8 text-sm font-medium leading-5 transition duration-300 border-b-2  whitespace-nowrap first:ml-0'
  let activeLinkColor = 'text-maintainerr border-maintainerr-600 border-b'
  let inactiveLinkColor =
    'text-zinc-500 border-transparent hover:text-zinc-300 hover:border-zinc-400 focus:text-zinc-300 focus:border-zinc-400'

  if (props.tabType === 'button') {
    linkClasses =
      'px-3 py-2 text-sm font-medium transition duration-300 rounded-md whitespace-nowrap mx-2 my-1'
    activeLinkColor = 'bg-maintainerrdark-700'
    inactiveLinkColor = 'bg-zinc-800 hover:bg-zinc-700 focus:bg-zinc-700'
  }

  return (
    <Link
      to={props.route}
      onMouseEnter={() => {
        if (!props.disabled) {
          void prefetchRoute(props.route)
        }
      }}
      onFocus={() => {
        if (!props.disabled) {
          void prefetchRoute(props.route)
        }
      }}
      onTouchStart={() => {
        if (!props.disabled) {
          void prefetchRoute(props.route)
        }
      }}
      onClick={(event) => {
        if (props.disabled) {
          event.preventDefault()
          props.onBlockedNavigate?.()
        }
      }}
      className={`${linkClasses} ${
        props.currentPath.match(props.regex)
          ? activeLinkColor
          : inactiveLinkColor
      }`}
      aria-disabled={props.disabled}
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
  isRouteDisabled?: (route: SettingsRoute) => boolean
}> = ({
  tabType = 'default',
  settingsRoutes,
  allEnabled = true,
  isRouteDisabled,
}) => {
  const location = useLocation()
  const navigate = useNavigate()

  const routeIsDisabled = (route: SettingsRoute) => {
    return !allEnabled || isRouteDisabled?.(route) === true
  }

  const currentRoute =
    settingsRoutes.find((route) =>
      (route.activeRegex ?? route.regex).test(location.pathname),
    )?.route ?? ''

  return (
    <>
      <div className="sm:hidden">
        <label htmlFor="tabs" className="sr-only">
          Select a Tab
        </label>
        <select
          value={currentRoute}
          onFocus={() => {
            if (currentRoute) {
              void prefetchRoute(currentRoute)
            }
          }}
          onChange={(e) => {
            const nextRoute = settingsRoutes.find(
              (route) => route.route === e.target.value,
            )

            if (nextRoute && routeIsDisabled(nextRoute)) {
              showMediaServerSetupRequiredToast()
              navigate(currentRoute)
              return
            }

            void prefetchRoute(e.target.value)
            navigate(e.target.value)
          }}
          onBlur={(e) => {
            const nextRoute = settingsRoutes.find(
              (route) => route.route === e.target.value,
            )

            if (!nextRoute || !routeIsDisabled(nextRoute)) {
              navigate(e.target.value)
            }
          }}
          aria-label="Selected Tab"
        >
          {settingsRoutes.map((route, index) => (
            <SettingsLink
              disabled={routeIsDisabled(route)}
              tabType={tabType}
              currentPath={location.pathname}
              route={route.route}
              regex={route.activeRegex ?? route.regex}
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
                disabled={routeIsDisabled(route)}
                tabType={tabType}
                currentPath={location.pathname}
                route={route.route}
                regex={route.activeRegex ?? route.regex}
                onBlockedNavigate={showMediaServerSetupRequiredToast}
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
                disabled={routeIsDisabled(route)}
                tabType={tabType}
                currentPath={location.pathname}
                route={route.route}
                regex={route.activeRegex ?? route.regex}
                onBlockedNavigate={showMediaServerSetupRequiredToast}
                key={`standard-settings-link-${index}`}
              >
                {route.content ?? route.text}
              </SettingsLink>
            ))}
          </nav>
        </div>
      )}
    </>
  )
}

export default SettingsTabs
