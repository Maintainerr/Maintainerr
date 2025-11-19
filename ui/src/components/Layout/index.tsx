import { ArrowLeftIcon, MenuAlt2Icon } from '@heroicons/react/solid'
import { debounce } from 'lodash-es'
import { useContext, useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Outlet, useNavigate } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import { LibrariesContextProvider } from '../../contexts/libraries-context'
import SearchContext from '../../contexts/search-context'
import SettingsContext from '../../contexts/settings-context'
import GetApiHandler from '../../utils/ApiHandler'
import SearchBar from '../Common/SearchBar'
import NavBar from './NavBar'

const Layout: React.FC = () => {
  const [navBarOpen, setNavBarOpen] = useState(false)
  const SearchCtx = useContext(SearchContext)
  const SettingsCtx = useContext(SettingsContext)
  const navigate = useNavigate()
  const basePath = import.meta.env.VITE_BASE_PATH ?? ''

  const handleNavbar = () => {
    setNavBarOpen(!navBarOpen)
  }

  useEffect(() => {
    GetApiHandler('/settings/test/setup').then((setupDone) => {
      if (!setupDone) {
        navigate('/settings/plex')
      }
    })
  }, [navigate])

  return (
    <section>
      <Helmet>
        <title>Maintainerr</title>
        <link rel="icon" href={`${basePath}/favicon.ico`} />
      </Helmet>
      <div className="flex h-full min-h-full min-w-0 bg-zinc-900">
        <div className="pwa-only fixed inset-0 z-20 h-1 w-full border-zinc-700 md:border-t" />
        <div className="absolute top-0 h-64 w-full bg-gradient-to-bl from-zinc-800 to-zinc-900">
          <div className="relative inset-0 h-full w-full bg-gradient-to-t from-zinc-900 to-transparent" />
        </div>
        <NavBar open={navBarOpen} setClosed={handleNavbar}></NavBar>
        <div className="relative mb-16 flex w-0 min-w-0 flex-1 flex-col lg:ml-64"></div>
        <div
          className={`searchbar fixed left-0 right-0 top-0 z-10 flex flex-shrink-0 bg-transparent bg-opacity-80 transition duration-300 lg:ml-64`}
        >
          <div className="transparent-glass-bg flex flex-1 items-center justify-between pr-4 md:pl-4 md:pr-4">
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
          className="relative top-16 mt-2 w-full focus:outline-none"
          tabIndex={0}
        >
          <div className="mb-6">
            <div className="max-w-8xl mx-auto px-4">
              <LibrariesContextProvider>
                <ToastContainer
                  stacked
                  position="top-right"
                  autoClose={4500}
                  hideProgressBar={false}
                  theme="dark"
                  closeOnClick
                />
                <Outlet />
              </LibrariesContextProvider>
            </div>
          </div>
        </main>
      </div>
    </section>
  )
}

export default Layout
