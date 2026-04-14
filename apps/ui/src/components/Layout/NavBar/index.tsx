import { Transition, TransitionChild } from '@headlessui/react'
import {
  CalendarIcon,
  ClipboardCheckIcon,
  CogIcon,
  CollectionIcon,
  EyeIcon,
  PhotographIcon,
  XIcon,
} from '@heroicons/react/outline'
import { ReactNode, useContext, useMemo, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import SearchContext from '../../../contexts/search-context'
import { prefetchRoute } from '../../../router'
import Messages from '../../Messages/Messages'
import VersionStatus from '../../VersionStatus'
import { useMediaServerSetupNavigationGuard } from '../MediaServerSetupGuard'

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
  const { isRouteBlocked, showBlockedNavigationToast } =
    useMediaServerSetupNavigationGuard()
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
        svgIcon: <CollectionIcon className="mr-3 h-6 w-6" />,
        name: collectionsLabel,
        matchPattern: /^\/collections(?:\/.*)?$/,
      },
      {
        key: '4',
        href: '/calendar',
        svgIcon: <CalendarIcon className="mr-3 h-6 w-6" />,
        name: 'Calendar',
        matchPattern: /^\/calendar(?:\/.*)?$/,
      },
      {
        key: '5',
        href: '/overlays',
        svgIcon: <PhotographIcon className="mr-3 h-6 w-6" />,
        name: 'Overlays',
        matchPattern: /^\/overlays(?:\/.*)?$/,
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

  const handlePrefetch = (path: string) => {
    void prefetchRoute(path)
  }

  const linkIsDisabled = (href: string) => {
    return isRouteBlocked(href)
  }

  const getNavLinkHandlers = (
    link: NavBarLink,
    isDisabled: boolean,
    onNavigate?: () => void,
  ) => ({
    onMouseEnter: () => {
      if (!isDisabled) {
        handlePrefetch(link.href)
      }
    },
    onFocus: () => {
      if (!isDisabled) {
        handlePrefetch(link.href)
      }
    },
    onTouchStart: () => {
      if (!isDisabled) {
        handlePrefetch(link.href)
      }
    },
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (isDisabled) {
        event.preventDefault()
        showBlockedNavigationToast()
        return
      }

      if (link.href === '/overview') {
        SearchCtx.removeText()
      }

      onNavigate?.()
    },
  })

  const logo = (
    <Link to="/" className="block w-full max-w-[204px]">
      <div className="block h-[60px] w-full overflow-hidden">
        <img
          className="block h-full w-full object-contain object-left"
          src={`${basePath}/logo.svg`}
          alt="Maintainerr logo"
          width={340}
          height={100}
          decoding="sync"
          fetchPriority="high"
        />
      </div>
    </Link>
  )

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
                  <div className="flex h-[60px] flex-shrink-0 items-center px-6">
                    {logo}
                  </div>
                  <nav className="mt-12 flex-1 space-y-4 px-4">
                    {navBarItems.map((link) => {
                      const isDisabled = linkIsDisabled(link.href)
                      const linkHandlers = getNavLinkHandlers(
                        link,
                        isDisabled,
                        setClosed,
                      )

                      return (
                        <Link
                          key={link.key}
                          to={link.href}
                          {...linkHandlers}
                          role="button"
                          tabIndex={0}
                          aria-disabled={isDisabled}
                          className={`flex items-center rounded-md px-2 py-2 text-base font-medium leading-6 text-white transition duration-150 ease-in-out ${
                            linkIsActive(link)
                              ? 'bg-gradient-to-br from-maintainerr-600 to-maintainerrdark-800 hover:from-maintainerr hover:to-maintainerrdark-700'
                              : isDisabled
                                ? 'cursor-not-allowed opacity-50'
                                : 'hover:bg-zinc-700'
                          } focus:bg-maintainerrdark-800 focus:outline-none`}
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
              <div className="flex h-[60px] flex-shrink-0 items-center px-6">
                {logo}
              </div>
              <nav className="mt-12 flex-1 space-y-4 px-4">
                {navBarItems.map((navBarLink) => {
                  const isDisabled = linkIsDisabled(navBarLink.href)
                  const linkHandlers = getNavLinkHandlers(
                    navBarLink,
                    isDisabled,
                  )

                  return (
                    <Link
                      key={`desktop-${navBarLink.key}`}
                      to={navBarLink.href}
                      {...linkHandlers}
                      aria-disabled={isDisabled}
                      className={`group flex items-center rounded-md px-2 py-2 text-lg font-medium leading-6 text-white transition duration-150 ease-in-out ${
                        linkIsActive(navBarLink)
                          ? 'bg-gradient-to-br from-maintainerr-600 to-maintainerrdark-800 hover:from-maintainerr hover:to-maintainerrdark-700'
                          : isDisabled
                            ? 'cursor-not-allowed opacity-50'
                            : 'hover:bg-zinc-700'
                      } focus:bg-maintainerrdark-800 focus:outline-none`}
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
