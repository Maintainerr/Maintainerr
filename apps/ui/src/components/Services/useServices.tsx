import { BellIcon, DownloadIcon, ServerIcon } from '@heroicons/react/outline'
import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import {
  DownloadClientType,
  MediaServerType,
  MetadataProviderPreference,
} from '@maintainerr/contracts'
import type { ComponentType, ReactNode } from 'react'
import { useNotificationConfigurations } from '../../api/notifications'
import { useServarrSettings, useSettings } from '../../api/settings'
import { hasCompletedMediaServerSetup } from '../../hooks/useMediaServerType'
import { resolveMetadataPreference } from '../../utils/metadataPreference'
import { mediaServerOptions, serviceLogo } from './mediaServerOptions'

const logo = serviceLogo

export type ServiceGroup =
  | 'mediaServer'
  | 'requests'
  | 'libraryManagers'
  | 'metadata'
  | 'watchStatistics'
  | 'downloads'
  | 'notifications'

// ok: in use; warning: set up but not working as saved (setup unfinished, every
// agent disabled); off: not set up.
export type ServiceState = 'ok' | 'warning' | 'off'

export interface Service {
  key: string
  route: string
  name: string
  group: ServiceGroup
  logo: string | ComponentType<{ className?: string }>
  description: ReactNode
  docsPage: string
  state: ServiceState
  // Undefined while the data behind it is still loading.
  status?: string
}

const downloadClients: Record<
  DownloadClientType,
  { name: string; logo: string }
> = {
  [DownloadClientType.QBITTORRENT]: {
    name: 'qBittorrent',
    logo: logo('qbittorrent.svg'),
  },
  [DownloadClientType.TRANSMISSION]: {
    name: 'Transmission',
    logo: logo('transmission.svg'),
  },
}

export const useServices = (enabled = true): Service[] => {
  const { t } = useLingui()
  const { data: settings } = useSettings()
  const loaded = enabled && !!settings
  const radarr = useServarrSettings('radarr', { enabled: loaded })
  const sonarr = useServarrSettings('sonarr', { enabled: loaded })
  const sportarr = useServarrSettings('sportarr', { enabled: loaded })
  const agents = useNotificationConfigurations({ enabled: loaded })

  if (!loaded) {
    return []
  }

  const notSetUp = t`Not set up`
  const simple = (configured: boolean) => ({
    state: configured ? ('ok' as const) : ('off' as const),
    status: configured ? t`Configured` : notSetUp,
  })
  const couldNotLoad = { state: 'warning' as const, status: t`Could not load` }
  // No status while a list loads; a failed load says so rather than staying blank.
  const servers = (query: { data?: unknown[]; isError: boolean }) => {
    if (query.isError) return couldNotLoad
    if (!query.data) return { state: 'off' as const }
    const serverCount = query.data.length
    return {
      state: serverCount > 0 ? ('ok' as const) : ('off' as const),
      status:
        serverCount > 0
          ? plural(serverCount, { one: '# server', other: '# servers' })
          : notSetUp,
    }
  }
  const enabledAgentCount = agents.data?.filter((agent) => agent.enabled).length

  const mediaServer = mediaServerOptions.find(
    (option) => option.value === settings.media_server_type,
  )
  const mediaServerReady = hasCompletedMediaServerSetup(settings)
  const metadataProvider =
    resolveMetadataPreference(
      settings.metadata_provider_preference ??
        MetadataProviderPreference.TMDB_PRIMARY,
      !!settings.tvdb_api_key,
    ) === MetadataProviderPreference.TVDB_PRIMARY
      ? { name: 'TVDB', logo: logo('tvdb_logo.svg') }
      : { name: 'TMDB', logo: logo('tmdb_icon.svg') }
  const downloadClient =
    settings.download_client_url && settings.download_client_type
      ? downloadClients[settings.download_client_type]
      : undefined
  // Listed until all three lists are known to be empty, so it never pops in.
  const hasArr = [radarr, sonarr, sportarr].some(
    (query) => !query.isSuccess || query.data.length > 0,
  )

  const services: (Service | false)[] = [
    {
      key: 'media-server',
      route: '/services/media-server',
      name: mediaServer?.name ?? t`Media server`,
      group: 'mediaServer',
      logo: mediaServer?.icon ?? ServerIcon,
      description: (
        <>
          {mediaServer
            ? t`Select your media server type. Switching will reset media server-specific data.`
            : t`Select your media server to get started with Maintainerr.`}
          {mediaServer?.value === MediaServerType.EMBY ? (
            <>
              {' '}
              {t`Configure your Emby server connection. Enter the server URL plus an API key, or sign in with admin credentials to obtain one.`}
            </>
          ) : null}
        </>
      ),
      docsPage: `Configuration/#${mediaServer?.value ?? 'media-server'}`,
      state: mediaServerReady ? 'ok' : mediaServer ? 'warning' : 'off',
      status: mediaServerReady ? t`Configured` : notSetUp,
    },
    {
      key: 'seerr',
      route: '/services/seerr',
      name: 'Seerr',
      group: 'requests',
      logo: logo('seerr.svg'),
      description: t`Needed to use Seerr in rules, remove Seerr requests, and show requesters in pre-deletion notifications.`,
      docsPage: 'Configuration/#seerr',
      ...simple(!!settings.seerr_url && !!settings.seerr_api_key),
    },
    {
      key: 'ombi',
      route: '/services/ombi',
      name: 'Ombi',
      group: 'requests',
      logo: logo('ombi.png'),
      description: t`Needed to use Ombi in rules and remove Ombi requests.`,
      docsPage: 'Configuration/#ombi',
      ...simple(!!settings.ombi_url && !!settings.ombi_api_key),
    },
    {
      key: 'radarr',
      route: '/services/radarr',
      name: 'Radarr',
      group: 'libraryManagers',
      logo: logo('radarr.svg'),
      description: t`Needed to use Radarr in rules and to remove or unmonitor movies.`,
      docsPage: 'Configuration/#radarr',
      ...servers(radarr),
    },
    {
      key: 'sonarr',
      route: '/services/sonarr',
      name: 'Sonarr',
      group: 'libraryManagers',
      logo: logo('sonarr.svg'),
      description: t`Needed to use Sonarr in rules and to remove or unmonitor shows.`,
      docsPage: 'Configuration/#sonarr',
      ...servers(sonarr),
    },
    {
      key: 'sportarr',
      route: '/services/sportarr',
      name: 'Sportarr',
      group: 'libraryManagers',
      logo: logo('sportarr.svg'),
      description: t`Needed to use Sportarr in rules and to manage sports leagues, seasons and events.`,
      docsPage: 'Configuration/#sportarr',
      ...servers(sportarr),
    },
    {
      key: 'metadata',
      route: '/services/metadata',
      name: t`Metadata`,
      group: 'metadata',
      logo: metadataProvider.logo,
      description: t`Choose the primary source for posters, backdrops and metadata. A TVDB API key is highly recommended: when the primary provider cannot match a movie or show, Maintainerr falls back to TVDB for its IDs and details.`,
      docsPage: 'Configuration/#metadata',
      state: 'ok',
      status: t`${{ provider: metadataProvider.name }} primary`,
    },
    {
      key: 'tracearr',
      route: '/services/tracearr',
      name: 'Tracearr',
      group: 'watchStatistics',
      logo: logo('tracearr.svg'),
      description: (
        <>
          {t`Needed to use Tracearr watch history in rules.`}{' '}
          {t`Maintainerr picks the Tracearr media server backend automatically: the one tracking the media server configured in Maintainerr.`}
        </>
      ),
      docsPage: 'Configuration/#tracearr',
      ...simple(!!settings.tracearr_url && !!settings.tracearr_api_key),
    },
    // Tautulli is Plex-only and Streamystats Jellyfin-only upstream.
    settings.media_server_type === MediaServerType.PLEX && {
      key: 'tautulli',
      route: '/services/tautulli',
      name: 'Tautulli',
      group: 'watchStatistics',
      logo: logo('tautulli.svg'),
      description: t`Needed to use Tautulli watch history in rules.`,
      docsPage: 'Configuration/#tautulli',
      ...simple(!!settings.tautulli_url && !!settings.tautulli_api_key),
    },
    settings.media_server_type === MediaServerType.JELLYFIN && {
      key: 'streamystats',
      route: '/services/streamystats',
      name: 'Streamystats',
      group: 'watchStatistics',
      logo: logo('streamystats.svg'),
      description: (
        <>
          {t`Needed to use Streamystats watchlists in rules.`}{' '}
          {t`Authentication reuses the configured Jellyfin API key.`}
        </>
      ),
      docsPage: 'Configuration/#streamystats',
      ...simple(!!settings.streamystats_url),
    },
    // The download client only cleans up after Radarr, Sonarr and Sportarr.
    hasArr && {
      key: 'download-client',
      route: '/services/download-client',
      name: t`Download client`,
      group: 'downloads',
      logo: downloadClient?.logo ?? DownloadIcon,
      description: t`When media is removed through Radarr, Sonarr or Sportarr, Maintainerr can remove the completed download (and optionally its data) from your download client. The download is matched via that service's download history, so media removed without one of them is left untouched.`,
      docsPage: 'Configuration/#download-client',
      state: downloadClient ? 'ok' : 'off',
      status: downloadClient?.name ?? notSetUp,
    },
    {
      key: 'notifications',
      route: '/services/notifications',
      name: t`Notifications`,
      group: 'notifications',
      logo: BellIcon,
      description: t`Send alerts about collections, rules, overlays and updates to email, chat and push services.`,
      docsPage: 'Notifications',
      ...(agents.isError
        ? couldNotLoad
        : {
            state: enabledAgentCount
              ? ('ok' as const)
              : agents.data?.length
                ? ('warning' as const)
                : ('off' as const),
            status:
              agents.data === undefined
                ? undefined
                : enabledAgentCount
                  ? plural(enabledAgentCount, {
                      one: '# agent enabled',
                      other: '# agents enabled',
                    })
                  : agents.data.length
                    ? t`Disabled`
                    : notSetUp,
          }),
    },
  ]

  return services.filter((service): service is Service => !!service)
}
