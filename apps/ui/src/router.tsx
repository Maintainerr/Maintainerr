import type { ComponentType } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import Layout, { LayoutErrorBoundary } from './components/Layout'
import Overview from './components/Overview'
// Settings is kept eager because it wraps an <Outlet /> — making it lazy
// would cause two sequential fetches (wrapper then child) on every settings navigation.
import Settings from './components/Settings'

const basePath = import.meta.env.VITE_BASE_PATH || ''

type LazyRouteModule = {
  default: ComponentType
}

type LazyRoute = {
  lazy: () => Promise<{ Component: ComponentType }>
  preload: () => Promise<LazyRouteModule>
}

const createLazyRoute = <T extends LazyRouteModule>(
  importer: () => Promise<T>,
): LazyRoute => {
  let promise: Promise<T> | undefined

  const preload = () => {
    if (!promise) {
      promise = importer().catch((error) => {
        promise = undefined
        throw error
      })
    }

    return promise
  }

  return {
    lazy: async () => {
      const { default: Component } = await preload()
      return { Component }
    },
    preload,
  }
}

const collectionsListRoute = createLazyRoute(
  () => import('./pages/CollectionsListPage'),
)
const collectionDetailRoute = createLazyRoute(
  () => import('./pages/CollectionDetailPage'),
)
const collectionMediaRoute = createLazyRoute(
  () => import('./pages/CollectionMediaPage'),
)
const collectionExclusionsRoute = createLazyRoute(
  () => import('./pages/CollectionExclusionsPage'),
)
const collectionInfoRoute = createLazyRoute(
  () => import('./pages/CollectionInfoPage'),
)
const rulesListRoute = createLazyRoute(() => import('./pages/RulesListPage'))
const ruleFormRoute = createLazyRoute(() => import('./pages/RuleFormPage'))
const docsRoute = createLazyRoute(() => import('./pages/DocsPage'))
const settingsMainRoute = createLazyRoute(
  () => import('./components/Settings/Main'),
)
const settingsPlexRoute = createLazyRoute(
  () => import('./components/Settings/Plex'),
)
const settingsJellyfinRoute = createLazyRoute(
  () => import('./components/Settings/Jellyfin'),
)
const settingsSonarrRoute = createLazyRoute(
  () => import('./components/Settings/Sonarr'),
)
const settingsMetadataRoute = createLazyRoute(
  () => import('./components/Settings/Metadata'),
)
const settingsRadarrRoute = createLazyRoute(
  () => import('./components/Settings/Radarr'),
)
const settingsSeerrRoute = createLazyRoute(
  () => import('./components/Settings/Seerr'),
)
const settingsTautulliRoute = createLazyRoute(
  () => import('./components/Settings/Tautulli'),
)
const settingsNotificationsRoute = createLazyRoute(
  () => import('./components/Settings/Notifications'),
)
const settingsJobsRoute = createLazyRoute(
  () => import('./components/Settings/Jobs'),
)
const settingsLogsRoute = createLazyRoute(
  () => import('./components/Settings/Logs'),
)
const settingsAboutRoute = createLazyRoute(
  () => import('./components/Settings/About'),
)

/**
 * Preloadable route definition — single source of truth for both
 * the React Router config and the prefetch system. Routes that use
 * createLazyRoute carry both `lazy` (for the router) and `preload`
 * (for hover-prefetching) from the same object, so they can't drift.
 */
type AppRoute = RouteObject & {
  preload?: LazyRoute['preload']
  children?: AppRoute[]
}

const appRoutes: AppRoute[] = [
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
        lazy: collectionsListRoute.lazy,
        preload: collectionsListRoute.preload,
      },
      {
        path: ':id',
        lazy: collectionDetailRoute.lazy,
        preload: collectionDetailRoute.preload,
        children: [
          {
            index: true,
            lazy: collectionMediaRoute.lazy,
            preload: collectionMediaRoute.preload,
          },
          {
            path: 'exclusions',
            lazy: collectionExclusionsRoute.lazy,
            preload: collectionExclusionsRoute.preload,
          },
          {
            path: 'info',
            lazy: collectionInfoRoute.lazy,
            preload: collectionInfoRoute.preload,
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
        lazy: rulesListRoute.lazy,
        preload: rulesListRoute.preload,
      },
      {
        path: 'new',
        lazy: ruleFormRoute.lazy,
        preload: ruleFormRoute.preload,
      },
      {
        path: 'edit/:id',
        lazy: ruleFormRoute.lazy,
        preload: ruleFormRoute.preload,
      },
      {
        path: 'clone/:id',
        lazy: ruleFormRoute.lazy,
        preload: ruleFormRoute.preload,
      },
    ],
  },
  {
    path: 'docs',
    lazy: docsRoute.lazy,
    preload: docsRoute.preload,
  },
  {
    path: 'settings',
    element: <Settings />,
    children: [
      {
        index: true,
        element: <Navigate to="/settings/main" replace />,
        preload: settingsMainRoute.preload,
      },
      {
        path: 'main',
        lazy: settingsMainRoute.lazy,
        preload: settingsMainRoute.preload,
      },
      {
        path: 'plex',
        lazy: settingsPlexRoute.lazy,
        preload: settingsPlexRoute.preload,
      },
      {
        path: 'jellyfin',
        lazy: settingsJellyfinRoute.lazy,
        preload: settingsJellyfinRoute.preload,
      },
      {
        path: 'sonarr',
        lazy: settingsSonarrRoute.lazy,
        preload: settingsSonarrRoute.preload,
      },
      {
        path: 'metadata',
        lazy: settingsMetadataRoute.lazy,
        preload: settingsMetadataRoute.preload,
      },
      {
        path: 'radarr',
        lazy: settingsRadarrRoute.lazy,
        preload: settingsRadarrRoute.preload,
      },
      {
        path: 'seerr',
        lazy: settingsSeerrRoute.lazy,
        preload: settingsSeerrRoute.preload,
      },
      {
        path: 'tautulli',
        lazy: settingsTautulliRoute.lazy,
        preload: settingsTautulliRoute.preload,
      },
      {
        path: 'notifications',
        lazy: settingsNotificationsRoute.lazy,
        preload: settingsNotificationsRoute.preload,
      },
      {
        path: 'jobs',
        lazy: settingsJobsRoute.lazy,
        preload: settingsJobsRoute.preload,
      },
      {
        path: 'logs',
        lazy: settingsLogsRoute.lazy,
        preload: settingsLogsRoute.preload,
      },
      {
        path: 'about',
        lazy: settingsAboutRoute.lazy,
        preload: settingsAboutRoute.preload,
      },
    ],
  },
]

const normalizePrefetchPath = (path: string) => {
  const trimmedPath = path.trim()
  let endOfPath = trimmedPath.length

  for (let index = 0; index < trimmedPath.length; index += 1) {
    const character = trimmedPath[index]
    if (character === '?' || character === '#') {
      endOfPath = index
      break
    }
  }

  const pathWithoutQueryOrHash = trimmedPath.slice(0, endOfPath) || '/'
  const normalizedPath = pathWithoutQueryOrHash.startsWith('/')
    ? pathWithoutQueryOrHash
    : `/${pathWithoutQueryOrHash}`

  if (normalizedPath.length <= 1) {
    return normalizedPath
  }

  let normalizedEnd = normalizedPath.length

  while (normalizedEnd > 1 && normalizedPath[normalizedEnd - 1] === '/') {
    normalizedEnd -= 1
  }

  return normalizedEnd === normalizedPath.length
    ? normalizedPath
    : normalizedPath.slice(0, normalizedEnd)
}

/**
 * Walk the route tree to find all routes matching a path,
 * collecting preload functions from every matched ancestor + leaf.
 */
const collectPreloaders = (
  routes: AppRoute[],
  segments: string[],
): Array<() => Promise<unknown>> => {
  const preloaders: Array<() => Promise<unknown>> = []

  const walk = (nodes: AppRoute[], remaining: string[]): boolean => {
    for (const route of nodes) {
      if (route.index) {
        if (remaining.length === 0) {
          if (route.preload) preloaders.push(route.preload)
          return true
        }
        continue
      }

      if (!route.path) {
        if (route.children && walk(route.children, remaining)) {
          if (route.preload) preloaders.push(route.preload)
          return true
        }
        continue
      }

      const routeSegments = route.path.split('/').filter(Boolean)
      if (routeSegments.length > remaining.length) continue

      const matches = routeSegments.every(
        (seg, i) => seg.startsWith(':') || seg === remaining[i],
      )
      if (!matches) continue

      if (route.preload) preloaders.push(route.preload)

      const rest = remaining.slice(routeSegments.length)
      if (rest.length === 0) {
        // Exact match — also preload the index child if present
        const indexChild = route.children?.find(
          (child): child is AppRoute => child.index === true,
        )
        if (indexChild?.preload) preloaders.push(indexChild.preload)
        return true
      }

      if (route.children && walk(route.children, rest)) return true
    }
    return false
  }

  walk(routes, segments)
  return preloaders
}

export const prefetchRoute = (path: string) => {
  const normalized = normalizePrefetchPath(path)
  const segments = normalized.split('/').filter(Boolean)
  const preloaders = collectPreloaders(appRoutes, segments)

  if (preloaders.length === 0) return Promise.resolve()
  return Promise.all(preloaders.map((fn) => fn())).then(() => undefined)
}

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
      errorElement: <LayoutErrorBoundary />,
      children: appRoutes,
    },
  ],
  {
    basename: basePath,
  },
)
