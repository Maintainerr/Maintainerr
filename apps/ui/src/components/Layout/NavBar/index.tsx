import { Transition, TransitionChild } from '@headlessui/react'
import {
  ArchiveIcon,
  ClipboardCheckIcon,
  CogIcon,
  EyeIcon,
  XIcon,
} from '@heroicons/react/outline'
import { ReactNode, useContext, useMemo, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import SearchContext from '../../../contexts/search-context'
import Messages from '../../Messages/Messages'
import VersionStatus from '../../VersionStatus'

interface NavBarLink {
  key: string
  href: string
  svgIcon: ReactNode
  name: string
  matchPattern?: RegExp
}

interface NavBarProps {
  open?: boolean
  setClosed: () => void
}

const NavBar: React.FC<NavBarProps> = ({ open, setClosed }) => {
  const navRef = useRef<HTMLDivElement>(null)
  const SearchCtx = useContext(SearchContext)
  const basePath = import.meta.env.VITE_BASE_PATH ?? ''
  const location = useLocation()
  // Keep variable for potential future customization
  const collectionsLabel = 'Collections'

  const navBarItems: NavBarLink[] = useMemo(
    () => [
      {
        key: '0',
        href: '/overview',
        svgIcon: <EyeIcon className="mr-3 h-6 w-6" />,
        name: 'Overview',
        matchPattern: /^\/(?:overview(?:\/.*)?|)$/,
      },
      {
        key: '1',
        href: '/rules',
        svgIcon: <ClipboardCheckIcon className="mr-3 h-6 w-6" />,
        name: 'Rules',
        matchPattern: /^\/rules(?:\/.*)?$/,
      },
      {
        key: '2',
        href: '/collections',
        svgIcon: <ArchiveIcon className="mr-3 h-6 w-6" />,
        name: collectionsLabel,
        matchPattern: /^\/collections(?:\/.*)?$/,
      },
      {
        key: '3',
        href: '/settings',
        svgIcon: <CogIcon className="mr-3 h-6 w-6" />,
        name: 'Settings',
        matchPattern: /^\/settings(?:\/.*)?$/,
      },
    ],
    [collectionsLabel],
  )

  const linkIsActive = (link: NavBarLink) => {
    if (link.matchPattern) {
      return link.matchPattern.test(location.pathname)
    }

    return location.pathname === link.href
  }

  return (
    <div>
      <div className="lg:hidden">
        <Transition show={open}>
          <TransitionChild>
            <div className="fixed inset-0 z-40 bg-zinc-900 opacity-90 transition-opacity duration-300 ease-linear data-[closed]:opacity-0"></div>
          </TransitionChild>
          <TransitionChild>
            <div className="fixed inset-y-0 z-40 flex translate-x-0 transform transition duration-300 ease-in-out data-[closed]:-translate-x-full">
              <div className="sidebar relative flex w-full max-w-xs flex-1 flex-col bg-zinc-800">
                <div className="sidebar-close-button absolute right-0 top-0 -mr-14 p-1">
                  <button
                    className="flex h-12 w-12 items-center justify-center rounded-full text-white focus:bg-zinc-600 focus:outline-none"
                    aria-label="Close sidebar"
                    onClick={() => setClosed()}
                  >
                    <XIcon className="h-6 w-6 text-white" />
                  </button>
                </div>
                <div
                  ref={navRef}
                  className="flex h-0 flex-1 flex-col overflow-y-auto pb-8 pt-4 sm:pb-4"
                >
                  <div className="flex flex-shrink-0 items-center px-2">
                    <span className="px-4 text-xl text-zinc-50">
                      <Link to="/">
                        <img
                          style={{ width: '100%', height: 'auto' }}
                          src={`${basePath}/logo.svg`}
                          alt="Logo"
                        />
                      </Link>
                    </span>
                  </div>
                  <nav className="mt-12 flex-1 space-y-4 px-4">
                    {navBarItems.map((link) => {
                      return (
                        <Link
                          key={link.key}
                          to={link.href}
                          onClick={() => {
                            if (link.href === '/overview') {
                              SearchCtx.removeText()
                            }
                            setClosed()
                          }}
                          role="button"
                          tabIndex={0}
                          className={`flex items-center rounded-md px-2 py-2 text-base font-medium leading-6 text-white transition duration-150 ease-in-out ${
                            linkIsActive(link)
                              ? 'bg-gradient-to-br from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700'
                              : 'hover:bg-zinc-700'
                          } focus:bg-amber-800 focus:outline-none`}
                        >
                          {link.svgIcon}
                          {link.name}
                        </Link>
                      )
                    })}
                  </nav>
                </div>
                <span className="mb-4 flex flex-col gap-y-4">
                  <Messages />
                  <VersionStatus />
                </span>
              </div>
              <div className="w-14 flex-shrink-0">
                {/* <!-- Force sidebar to shrink to fit close icon --> */}
              </div>
            </div>
          </TransitionChild>
        </Transition>
      </div>

      <div className="fixed bottom-0 left-0 top-0 z-30 hidden lg:flex lg:flex-shrink-0">
        <div className="sidebar flex w-64 flex-col">
          <div className="flex h-0 flex-1 flex-col">
            <div className="flex flex-1 flex-col overflow-y-auto pb-4 pt-4">
              <div className="flex flex-shrink-0 items-center">
                <span className="px-4 text-2xl text-zinc-50">
                  <Link to="/">
                    <img
                      style={{ width: '100%', height: 'auto' }}
                      src={`${basePath}/logo.svg`}
                      alt="Logo"
                    />
                  </Link>
                </span>
              </div>
              <nav className="mt-12 flex-1 space-y-4 px-4">
                {navBarItems.map((navBarLink) => {
                  return (
                    <Link
                      key={`desktop-${navBarLink.key}`}
                      to={navBarLink.href}
                      onClick={() => {
                        if (navBarLink.href === '/overview') {
                          SearchCtx.removeText()
                        }
                      }}
                      className={`group flex items-center rounded-md px-2 py-2 text-lg font-medium leading-6 text-white transition duration-150 ease-in-out ${
                        linkIsActive(navBarLink)
                          ? 'bg-gradient-to-br from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700'
                          : 'hover:bg-zinc-700'
                      } focus:bg-amber-800 focus:outline-none`}
                    >
                      {navBarLink.svgIcon}
                      {navBarLink.name}
                    </Link>
                  )
                })}
              </nav>
              <div className="flex flex-col gap-y-4">
                <Messages />
                <VersionStatus />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default NavBar
