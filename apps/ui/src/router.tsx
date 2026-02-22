import { createBrowserRouter, Navigate } from 'react-router-dom'
import Layout, { LayoutErrorBoundary } from './components/Layout'
import Overview from './components/Overview'
import Settings from './components/Settings'
import SettingsAbout from './components/Settings/About'
import SettingsJellyfin from './components/Settings/Jellyfin'
import SettingsSeerr from './components/Settings/Seerr'
import SettingsJobs from './components/Settings/Jobs'
import SettingsLogs from './components/Settings/Logs'
import SettingsMain from './components/Settings/Main'
import SettingsNotifications from './components/Settings/Notifications'
import SettingsPlex from './components/Settings/Plex'
import SettingsRadarr from './components/Settings/Radarr'
import SettingsSonarr from './components/Settings/Sonarr'
import SettingsTautulli from './components/Settings/Tautulli'
import CollectionDetailPage from './pages/CollectionDetailPage'
import CollectionExclusionsPage from './pages/CollectionExclusionsPage'
import CollectionInfoPage from './pages/CollectionInfoPage'
import CollectionMediaPage from './pages/CollectionMediaPage'
import CollectionsListPage from './pages/CollectionsListPage'
import DocsPage from './pages/DocsPage'
import RuleFormPage from './pages/RuleFormPage'
import RulesListPage from './pages/RulesListPage'

const basePath = import.meta.env.VITE_BASE_PATH || ''

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
      errorElement: <LayoutErrorBoundary />,
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
          children: [
            {
              index: true,
              element: <CollectionsListPage />,
            },
            {
              path: ':id',
              element: <CollectionDetailPage />,
              children: [
                {
                  index: true,
                  element: <CollectionMediaPage />,
                },
                {
                  path: 'exclusions',
                  element: <CollectionExclusionsPage />,
                },
                {
                  path: 'info',
                  element: <CollectionInfoPage />,
                },
              ],
            },
          ],
        },
        {
          path: 'rules',
          children: [
            {
              index: true,
              element: <RulesListPage />,
            },
            {
              path: 'new',
              element: <RuleFormPage />,
            },
            {
              path: 'edit/:id',
              element: <RuleFormPage />,
            },
            {
              path: 'clone/:id',
              element: <RuleFormPage />,
            },
          ],
        },
        {
          path: 'docs',
          element: <DocsPage />,
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
              path: 'jellyfin',
              element: <SettingsJellyfin />,
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
              path: 'seerr',
              element: <SettingsSeerr />,
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
