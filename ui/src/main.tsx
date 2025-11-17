import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import { RouterProvider } from 'react-router-dom'
import 'react-toastify/dist/ReactToastify.css'
import { EventsProvider } from './contexts/events-context'
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
                <RouterProvider router={router} />
              </SearchContextProvider>
            </SettingsContextProvider>
          </TaskStatusProvider>
        </EventsProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </React.StrictMode>,
)
