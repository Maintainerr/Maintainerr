import { createBrowserRouter, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Collection from './components/Collection'
import Overview from './components/Overview'
import Rules from './components/Rules'
import Settings from './components/Settings'
import SettingsAbout from './components/Settings/About'
import SettingsJellyseerr from './components/Settings/Jellyseerr'
import SettingsJobs from './components/Settings/Jobs'
import SettingsLogs from './components/Settings/Logs'
import SettingsMain from './components/Settings/Main'
import SettingsNotifications from './components/Settings/Notifications'
import SettingsOverseerr from './components/Settings/Overseerr'
import SettingsPlex from './components/Settings/Plex'
import SettingsRadarr from './components/Settings/Radarr'
import SettingsSonarr from './components/Settings/Sonarr'
import SettingsTautulli from './components/Settings/Tautulli'
import DocsPage from './pages/DocsPage'
import PlexLoadingPage from './pages/PlexLoadingPage'

const basePath = import.meta.env.VITE_BASE_PATH || ''

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
      children: [
        {
          index: true,
          element: <Navigate to="/overview" replace />,
        },
        {
          path: 'overview',
          element: <Overview />,
        },
        {
          path: 'collections',
          element: <Collection />,
        },
        {
          path: 'rules',
          element: <Rules />,
        },
        {
          path: 'docs',
          element: <DocsPage />,
        },
        {
          path: 'login/plex/loading',
          element: <PlexLoadingPage />,
        },
        {
          path: 'settings',
          element: <Settings />,
          children: [
            {
              index: true,
              element: <Navigate to="/settings/main" replace />,
            },
            {
              path: 'main',
              element: <SettingsMain />,
            },
            {
              path: 'plex',
              element: <SettingsPlex />,
            },
            {
              path: 'sonarr',
              element: <SettingsSonarr />,
            },
            {
              path: 'radarr',
              element: <SettingsRadarr />,
            },
            {
              path: 'overseerr',
              element: <SettingsOverseerr />,
            },
            {
              path: 'jellyseerr',
              element: <SettingsJellyseerr />,
            },
            {
              path: 'tautulli',
              element: <SettingsTautulli />,
            },
            {
              path: 'notifications',
              element: <SettingsNotifications />,
            },
            {
              path: 'jobs',
              element: <SettingsJobs />,
            },
            {
              path: 'logs',
              element: <SettingsLogs />,
            },
            {
              path: 'about',
              element: <SettingsAbout />,
            },
          ],
        },
      ],
    },
  ],
  {
    basename: basePath,
  },
)
