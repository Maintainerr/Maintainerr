import React, { ReactNode } from 'react'

export interface TabbedRoute {
  text: string
  content?: React.ReactNode
  route: string
}

export interface ItabbedLinks {
  routes: TabbedRoute[]
  allEnabled?: boolean
  currentRoute?: string
  onChange: (target: string) => void
}

export interface ITabbedLink {
  currentRoute: string
  route: string
  hidden?: boolean
  disabled?: boolean
  children?: ReactNode
  onClick: (path: string) => void
}

const TabbedLink = (props: ITabbedLink) => {
  const linkClasses =
    (props.disabled ? 'pointer-events-none touch-none ' : 'cursor-pointer ') +
    'px-1 py-4 ml-8 text-md font-semibold leading-5 transition duration-300 leading-5 whitespace-nowrap first:ml-0'
  const activeLinkColor = ' border-b text-amber-500 border-amber-600'
  const inactiveLinkColor =
    'border-transparent text-zinc-500 hover:border-b focus:border-b hover:text-zinc-300 hover:border-zinc-400 focus:text-zinc-300 focus:border-zinc-400'

  return (
    <a
      onClick={() => props.onClick(props.route)}
      className={`${linkClasses} ${
        props.currentRoute.match(props.route)
          ? activeLinkColor
          : inactiveLinkColor
      }`}
      aria-current="page"
    >
      {props.children}
    </a>
  )
}

const TabbedLinks = (props: ItabbedLinks) => {
  return (
    <>
      <div className="hide-scrollbar overflow-x-scroll border-b border-zinc-600">
        <nav className="flex">
          {props.routes.map((route, index) => (
            <TabbedLink
              onClick={(r) => props.onChange(r)}
              route={route.route}
              disabled={!props.allEnabled}
              currentRoute={
                props.currentRoute ? props.currentRoute : props.routes[0]?.route
              }
              key={`standard-settings-link-${index}`}
            >
              {route.text}
            </TabbedLink>
          ))}
        </nav>
      </div>
    </>
  )
}

export default TabbedLinks
