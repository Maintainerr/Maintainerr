import { ArrowLeftIcon, MenuAlt2Icon } from '@heroicons/react/solid'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { debounce } from 'lodash-es'
import { ReactNode, use, useEffect, useRef, useState } from 'react'
import {
  isRouteErrorResponse,
  Outlet,
  useNavigate,
  useNavigation,
  useRouteError,
} from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import SearchContext from '../../contexts/search-context'
import { INTERACTION_DEBOUNCE_MS } from '../../utils/uiBehavior'
import { SmallLoadingSpinner } from '../Common/LoadingSpinner'
import SearchBar from '../Common/SearchBar'
import NavBar from './NavBar'

type LayoutShellProps = {
  children: ReactNode
}

const LayoutShell: React.FC<LayoutShellProps> = ({ children }) => {
  const [navBarOpen, setNavBarOpen] = useState(false)
  const SearchCtx = use(SearchContext)
  const { t } = useLingui()
  const navigate = useNavigate()
  const navigation = useNavigation()
  const basePath = import.meta.env.VITE_BASE_PATH ?? ''
  const debouncedSearchRef = useRef<ReturnType<typeof debounce> | undefined>(
    undefined,
  )
  const isNavigating = navigation.state !== 'idle'

  const handleNavbar = () => {
    setNavBarOpen(!navBarOpen)
  }

  useEffect(() => {
    const debouncedSearch = debounce((text: string) => {
      SearchCtx.addText(text)
      navigate('/overview')
    }, INTERACTION_DEBOUNCE_MS)

    debouncedSearchRef.current = debouncedSearch

    return () => {
      debouncedSearch.cancel()

      if (debouncedSearchRef.current === debouncedSearch) {
        debouncedSearchRef.current = undefined
      }
    }
  }, [SearchCtx, navigate])

  const handleSearch = (text: string) => {
    if (text === '') {
      debouncedSearchRef.current?.cancel()
      SearchCtx.removeText()
      return
    }

    debouncedSearchRef.current?.(text)
  }

  return (
    <section>
      <title>Maintainerr</title>
      <link rel="icon" href={`${basePath}/favicon.ico`} />
      <link
        rel="apple-touch-icon"
        sizes="180x180"
        href={`${basePath}/apple-touch-icon.png`}
      />
      <div className="flex h-full min-h-full min-w-0 bg-zinc-900">
        <div className="pwa-only fixed inset-0 z-20 h-1 w-full border-zinc-700 md:border-t" />
        <div className="absolute top-0 h-64 w-full bg-linear-to-bl from-zinc-800 to-zinc-900">
          <div className="relative inset-0 h-full w-full bg-linear-to-t from-zinc-900 to-transparent" />
        </div>
        <NavBar open={navBarOpen} setClosed={handleNavbar}></NavBar>
        <div
          className={`searchbar fixed top-0 right-0 left-0 z-10 flex shrink-0 bg-transparent transition duration-300 lg:ml-64`}
        >
          {/* No drop shadow: it lands on the pinned page control row below and
              reads as a seam between two panes of the same glass. */}
          <div className="transparent-glass-bg flex flex-1 items-center justify-between pr-4 shadow-none md:pr-4 md:pl-4">
            <button
              className={`px-4 text-white opacity-70 transition duration-300 focus:outline-hidden lg:hidden`}
              aria-label={t`Open sidebar`}
              onClick={() => setNavBarOpen(true)}
            >
              <MenuAlt2Icon className="h-6 w-6" />
            </button>
            <button
              className={`mr-2 text-white opacity-70 transition duration-300 hover:text-white focus:text-white focus:outline-hidden`}
              onClick={() => navigate(-1)}
            >
              <ArrowLeftIcon className="w-7" />
            </button>
            <SearchBar
              key={SearchCtx.search.text === '' ? 'empty' : 'active'}
              initialValue={SearchCtx.search.text}
              onSearch={handleSearch}
            />
          </div>
        </div>

        <main
          className="relative top-16 mt-2 mb-16 w-0 min-w-0 flex-1 focus:outline-hidden lg:ml-64"
          tabIndex={0}
        >
          <div className="mb-6">
            <div className="max-w-8xl mx-auto px-4">
              <ToastContainer
                stacked
                position="top-right"
                autoClose={4500}
                hideProgressBar={false}
                theme="dark"
                closeOnClick
              />
              {isNavigating ? (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center bg-zinc-900/20 pt-10 backdrop-blur-[1px]">
                  <SmallLoadingSpinner className="h-8 w-8" />
                </div>
              ) : null}
              {children}
            </div>
          </div>
        </main>
      </div>
    </section>
  )
}

const Layout: React.FC = () => {
  return (
    <LayoutShell>
      <Outlet />
    </LayoutShell>
  )
}

// Runs outside a component, so the fixed messages are lazy descriptors that
// the boundary resolves at render. Text coming off the wire stays a string.
const describeRouteError = (
  error: unknown,
): {
  title: string | MessageDescriptor
  message: string | MessageDescriptor
} => {
  if (!error) {
    return {
      title: msg`Unknown error`,
      message: msg`An unexpected error occurred.`,
    }
  }

  if (isRouteErrorResponse(error)) {
    const dataMessage =
      typeof error.data === 'string'
        ? error.data
        : (error.data?.message ?? error.data?.error)

    return {
      title: `${error.status} ${error.statusText}`.trim(),
      message: dataMessage ?? msg`The server returned an unexpected response.`,
    }
  }

  if (error instanceof Error) {
    // Error.prototype.name is always a string, so no descriptor fallback.
    return {
      title: error.name,
      message: error.message,
    }
  }

  return {
    title: msg`Unexpected error`,
    message: String(error),
  }
}

export const LayoutErrorBoundary: React.FC = () => {
  const error = useRouteError()
  const navigate = useNavigate()
  const { t } = useLingui()
  const { title, message } = describeRouteError(error)
  // The hook's t resolves a descriptor just as well, without reaching for
  // the underscore-prefixed runtime API.
  const render = (value: string | MessageDescriptor) =>
    typeof value === 'string' ? value : t(value)

  return (
    <LayoutShell>
      <div
        role="alert"
        className="rounded-sm border border-error-500/60 bg-error-500/10 p-6 text-error-100 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-error-200">
          {render(title)}
        </h2>
        <p className="mt-2 text-sm text-error-100">{render(message)}</p>
        <p className="mt-4 text-xs text-error-200/80">
          <Trans>
            You can try going back or reloading the page. If the problem
            persists, please check the browser console for more details.
          </Trans>
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="rounded-sm bg-error-500/30 px-4 py-2 text-sm font-medium text-error-50 transition hover:bg-error-500/40 focus:ring-2 focus:ring-error-300/60 focus:outline-hidden"
            onClick={() => navigate(-1)}
          >
            <Trans>Go Back</Trans>
          </button>
          <button
            className="rounded-sm bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-700 focus:ring-2 focus:ring-zinc-500/60 focus:outline-hidden"
            onClick={() => navigate('/overview')}
          >
            <Trans>Go To Overview</Trans>
          </button>
        </div>
      </div>
    </LayoutShell>
  )
}

export default Layout
