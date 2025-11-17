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
        },
        {
          path: 'settings/plex',
          element: <SettingsPlex />,
        },
        {
          path: 'settings/sonarr',
          element: <SettingsSonarr />,
        },
        {
          path: 'settings/radarr',
          element: <SettingsRadarr />,
        },
        {
          path: 'settings/overseerr',
          element: <SettingsOverseerr />,
        },
        {
          path: 'settings/jellyseerr',
          element: <SettingsJellyseerr />,
        },
        {
          path: 'settings/tautulli',
          element: <SettingsTautulli />,
        },
        {
          path: 'settings/notifications',
          element: <SettingsNotifications />,
        },
        {
          path: 'settings/jobs',
          element: <SettingsJobs />,
        },
        {
          path: 'settings/logs',
          element: <SettingsLogs />,
        },
        {
          path: 'settings/main',
          element: <SettingsMain />,
        },
        {
          path: 'settings/about',
          element: <SettingsAbout />,
        },
      ],
    },
  ],
  {
    basename: basePath,
  },
)
