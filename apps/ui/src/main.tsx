import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import 'react-toastify/dist/ReactToastify.css'
import '../styles/globals.css'
import { EventsProvider } from './contexts/events-context'
import { LocaleProvider } from './contexts/locale-context'
import { SearchContextProvider } from './contexts/search-context'
import { TaskStatusProvider } from './contexts/taskstatus-context'
import { detectLocale, loadCatalog } from './i18n'
import { router } from './router'

const queryClient = new QueryClient()

// Activate before the first render so no source strings ever reach the screen.
await loadCatalog(detectLocale())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocaleProvider>
      <QueryClientProvider client={queryClient}>
        <EventsProvider>
          <TaskStatusProvider>
            <SearchContextProvider>
              <RouterProvider router={router} />
            </SearchContextProvider>
          </TaskStatusProvider>
        </EventsProvider>
      </QueryClientProvider>
    </LocaleProvider>
  </React.StrictMode>,
)
