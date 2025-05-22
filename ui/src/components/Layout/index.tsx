import { ArrowLeftIcon, MenuAlt2Icon } from '@heroicons/react/solid'
import { debounce } from 'lodash-es'
import { ReactNode, useContext, useEffect, useState } from 'react'
import {
  isRouteErrorResponse,
  Outlet,
  useLocation,
  useNavigate,
  useRouteError,
} from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import SearchContext from '../../contexts/search-context'
import GetApiHandler from '../../utils/ApiHandler'
import SearchBar from '../Common/SearchBar'
import NavBar from './NavBar'

type LayoutShellProps = {
  children: ReactNode
}

const LayoutShell: React.FC<LayoutShellProps> = ({ children }) => {
  const [navBarOpen, setNavBarOpen] = useState(false)
  const SearchCtx = useContext(SearchContext)
  const navigate = useNavigate()
  const basePath = import.meta.env.VITE_BASE_PATH ?? ''
  const location = useLocation()

  const handleNavbar = () => {
    setNavBarOpen(!navBarOpen)
  }

  useEffect(() => {
    GetApiHandler('/settings/test/setup').then((setupDone) => {
      if (!setupDone) {
        navigate('/settings/plex')
      }
    })
  }, [navigate, location.pathname])

  return (
    <section>
      <title>Maintainerr</title>
      <link rel="icon" href={`${basePath}/favicon.ico`} />
      <div className="flex h-full min-h-full min-w-0 bg-zinc-900">
        <div className="pwa-only fixed inset-0 z-20 h-1 w-full border-zinc-700 md:border-t" />
        <div className="absolute top-0 h-64 w-full bg-zinc-900">
          <div className="relative inset-0 h-full w-full bg-gradient-to-t from-zinc-900 to-transparent" />
        </div>
        <NavBar open={navBarOpen} setClosed={handleNavbar}></NavBar>
        <div className="relative mb-16 flex w-0 min-w-0 flex-1 flex-col lg:ml-64"></div>
        <div
          className={`searchbar fixed left-0 right-0 top-0 z-10 flex flex-shrink-0 bg-transparent bg-opacity-80 transition duration-300 lg:ml-64`}
        >
          <div className="flex flex-1 items-center justify-between bg-zinc-900 pr-4 md:pl-4 md:pr-4">
            <button
              className={`px-4 text-white opacity-70 transition duration-300 focus:outline-none lg:hidden`}
              aria-label="Open sidebar"
              onClick={() => setNavBarOpen(true)}
            >
              <MenuAlt2Icon className="h-6 w-6" />
            </button>
            <button
              className={`mr-2 text-white opacity-70 transition duration-300 hover:text-white focus:text-white focus:outline-none`}
              onClick={() => navigate(-1)}
            >
              <ArrowLeftIcon className="w-7" />
            </button>
            <SearchBar
              onSearch={debounce((text: string) => {
                SearchCtx.addText(text)

                if (text !== '') {
                  navigate('/overview')
                }
              }, 1000)}
            />
          </div>
        </div>

        <main
          className="relative top-16 w-full focus:outline-none"
          tabIndex={0}
        >
          <div className="mb-6">
<<<<<<< HEAD
            <div className="max-w-8xl mx-auto px-4">
              <ToastContainer
                stacked
                position="top-right"
                autoClose={4500}
                hideProgressBar={false}
                theme="dark"
                closeOnClick
              />
              {children}
            </div>
=======
            <div className="mx-auto px-4">{props.children}</div>
>>>>>>> fafbad29 (initial commit after updating to new branch and fixing conflicts)
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

const describeRouteError = (
  error: unknown,
): { title: string; message: string } => {
  if (!error) {
    return {
      title: 'Unknown error',
      message: 'An unexpected error occurred.',
    }
  }

  if (isRouteErrorResponse(error)) {
    const dataMessage =
      typeof error.data === 'string'
        ? error.data
        : (error.data?.message ?? error.data?.error)

    return {
      title: `${error.status} ${error.statusText}`.trim(),
      message: dataMessage ?? 'The server returned an unexpected response.',
    }
  }

  if (error instanceof Error) {
    return {
      title: error.name ?? 'Error',
      message: error.message,
    }
  }

  return {
    title: 'Unexpected error',
    message: String(error),
  }
}

export const LayoutErrorBoundary: React.FC = () => {
  const error = useRouteError()
  const navigate = useNavigate()
  const { title, message } = describeRouteError(error)

  return (
    <LayoutShell>
      <div
        role="alert"
        className="rounded border border-red-500/60 bg-red-500/10 p-6 text-red-100 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-red-200">{title}</h2>
        <p className="mt-2 text-sm text-red-100">{message}</p>
        <p className="mt-4 text-xs text-red-200/80">
          You can try going back or reloading the page. If the problem persists,
          please check the browser console for more details.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="rounded bg-red-500/30 px-4 py-2 text-sm font-medium text-red-50 transition hover:bg-red-500/40 focus:outline-none focus:ring-2 focus:ring-red-300/60"
            onClick={() => navigate(-1)}
          >
            Go Back
          </button>
          <button
            className="rounded bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500/60"
            onClick={() => navigate('/overview')}
          >
            Go To Overview
          </button>
        </div>
      </div>
    </LayoutShell>
  )
}

export default Layout
