import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import { RouterProvider } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { EventsProvider } from './contexts/events-context'
import { LibrariesContextProvider } from './contexts/libraries-context'
import { SearchContextProvider } from './contexts/search-context'
import { SettingsContextProvider } from './contexts/settings-context'
import { TaskStatusProvider } from './contexts/taskstatus-context'
import { router } from './router'
import '../styles/globals.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <EventsProvider>
          <TaskStatusProvider>
            <SettingsContextProvider>
              <SearchContextProvider>
                <LibrariesContextProvider>
                  <ToastContainer
                    stacked
                    position="top-right"
                    autoClose={4500}
                    hideProgressBar={false}
                    theme="dark"
                    closeOnClick
                  />
                  <RouterProvider router={router} />
                </LibrariesContextProvider>
              </SearchContextProvider>
            </SettingsContextProvider>
          </TaskStatusProvider>
        </EventsProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </React.StrictMode>,
)
