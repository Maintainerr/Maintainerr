import {
  DownloadClientType,
  MediaServerType,
  MetadataProviderPreference,
} from '@maintainerr/contracts'
import {
  buildQueryErrorResult,
  buildQueryLoadingResult,
  buildQuerySuccessResult,
} from '../../test-utils/queryResults'
import { renderHook } from '../../test-utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useServices } from './useServices'

// A list, undefined while it loads, or the error it failed with.
type List = unknown[] | undefined | Error

let settings: Record<string, unknown>
let servers: Record<string, List>
let agents: List

const result = (list: List) =>
  list instanceof Error
    ? buildQueryErrorResult(list)
    : list
      ? buildQuerySuccessResult(list)
      : buildQueryLoadingResult()

vi.mock('../../api/settings', () => ({
  useSettings: () => buildQuerySuccessResult(settings),
  useServarrSettings: (type: string) => result(servers[type]),
}))

vi.mock('../../api/notifications', () => ({
  useNotificationConfigurations: () => result(agents),
}))

const byKey = () =>
  Object.fromEntries(
    renderHook(() => useServices()).result.current.map((service) => [
      service.key,
      service,
    ]),
  )

describe('useServices', () => {
  beforeEach(() => {
    settings = {
      media_server_type: MediaServerType.PLEX,
      plex_hostname: 'plex.local',
      plex_name: 'Plex',
      plex_port: 32400,
      plex_auth_token: 'token',
      seerr_url: 'http://seerr.local',
      seerr_api_key: 'abc...xyz',
      metadata_provider_preference: MetadataProviderPreference.TVDB_PRIMARY,
      tvdb_api_key: null,
    }
    servers = { radarr: [{ id: 1 }, { id: 2 }], sonarr: [], sportarr: [] }
    agents = [
      { id: 1, enabled: true },
      { id: 2, enabled: false },
    ]
  })

  it('derives each status from the loaded settings', () => {
    const services = byKey()

    expect(services['media-server']).toMatchObject({
      name: 'Plex',
      status: 'Configured',
      state: 'ok',
    })
    expect(services.seerr.status).toBe('Configured')
    expect(services.ombi.status).toBe('Not set up')
    expect(services.radarr.status).toBe('2 servers')
    expect(services.sonarr.status).toBe('Not set up')
    expect(services.ombi.state).toBe('off')
    expect(services.notifications).toMatchObject({
      status: '1 agent enabled',
      state: 'ok',
    })
    expect(services.tautulli).toBeDefined()
    expect(services.streamystats).toBeUndefined()
  })

  it('warns when something is set up but not working as saved', () => {
    agents = [{ id: 1, enabled: false }]
    settings.plex_auth_token = null

    expect(byKey().notifications).toMatchObject({
      status: 'Disabled',
      state: 'warning',
    })
    expect(byKey()['media-server'].state).toBe('warning')
  })

  it('shows the metadata provider that is actually primary', () => {
    expect(byKey().metadata.status).toBe('TMDB primary')

    settings.tvdb_api_key = 'abc...xyz'
    expect(byKey().metadata).toMatchObject({
      status: 'TVDB primary',
      logo: '/icons_logos/tvdb_logo.svg',
    })
  })

  it('names and shows the configured download client', () => {
    expect(byKey()['download-client'].status).toBe('Not set up')

    settings.download_client_type = DownloadClientType.QBITTORRENT
    settings.download_client_url = 'http://qbit.local'
    expect(byKey()['download-client']).toMatchObject({
      status: 'qBittorrent',
      logo: '/icons_logos/qbittorrent.svg',
    })

    servers.radarr = []
    expect(byKey()['download-client']).toBeUndefined()
  })

  it('leaves counts unset while they load', () => {
    servers.radarr = undefined
    agents = undefined

    expect(byKey().radarr.status).toBeUndefined()
    expect(byKey().notifications.status).toBeUndefined()
    expect(byKey()['download-client']).toBeDefined()
  })

  it('says when a list could not load', () => {
    servers.radarr = new Error('down')
    agents = new Error('down')

    expect(byKey().radarr).toMatchObject({
      status: 'Could not load',
      state: 'warning',
    })
    expect(byKey().notifications.status).toBe('Could not load')
  })
})
