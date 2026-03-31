import { MediaServerType } from '@maintainerr/contracts'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INTERACTION_DEBOUNCE_MS } from '../../utils/uiTiming'
import SettingsWrapper from './index'

const navigate = vi.fn()

const getMediaServerSettingsPath = (mediaServerType: MediaServerType) => {
  return mediaServerType === MediaServerType.PLEX
    ? '/settings/plex'
    : '/settings/jellyfin'
}

let currentPath = getMediaServerSettingsPath(MediaServerType.JELLYFIN)

type MockSettingsResult = {
  data?: {
    media_server_type?: MediaServerType | null
    plex_auth_token: string | null
    jellyfin_url?: string
    jellyfin_api_key?: string
  }
  isLoading: boolean
  error?: Error
}

let currentSettingsResult: MockSettingsResult

vi.mock('../../api/settings', () => ({
  useSettings: () => currentSettingsResult,
}))

vi.mock('../Common/Alert', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('../../router', () => ({
  prefetchRoute: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    Link: ({
      to,
      children,
      ...props
    }: React.PropsWithChildren<{ to: string }>) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
    Outlet: () => <div>settings outlet</div>,
    useLocation: () => ({ pathname: currentPath }),
    useNavigate: () => navigate,
  }
})

const getDesktopTabLabels = (container: HTMLElement) => {
  return Array.from(container.querySelectorAll('nav.flex a')).map((link) =>
    link.textContent?.trim(),
  )
}

describe('SettingsWrapper', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    navigate.mockReset()
    currentPath = getMediaServerSettingsPath(MediaServerType.JELLYFIN)
    currentSettingsResult = {
      data: undefined,
      isLoading: true,
      error: undefined,
    }
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('keeps the configured media server tab stable while settings are loading', () => {
    const { container, rerender } = render(<SettingsWrapper />)

    expect(getDesktopTabLabels(container)).toEqual([
      'General',
      'Jellyfin',
      'Seerr',
      'Radarr',
      'Sonarr',
      'Metadata',
      'Notifications',
      'Logs',
      'Jobs',
      'About',
    ])

    act(() => {
      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS - 1)
    })

    currentSettingsResult = {
      data: {
        media_server_type: MediaServerType.JELLYFIN,
        plex_auth_token: null,
        jellyfin_url: 'http://jellyfin.local',
        jellyfin_api_key: 'token',
      },
      isLoading: false,
      error: undefined,
    }

    rerender(<SettingsWrapper />)

    expect(getDesktopTabLabels(container)).toEqual([
      'General',
      'Jellyfin',
      'Seerr',
      'Radarr',
      'Sonarr',
      'Metadata',
      'Notifications',
      'Logs',
      'Jobs',
      'About',
    ])
  })

  it('does not mark the loading placeholder media server tab as active on the general route', () => {
    currentPath = '/settings/main'

    const { container } = render(<SettingsWrapper />)

    const desktopLinks = Array.from(container.querySelectorAll('nav.flex a'))
    const activeLinks = desktopLinks.filter((link) =>
      link.className.includes('text-amber-500'),
    )

    expect(activeLinks).toHaveLength(1)
    expect(activeLinks[0]?.textContent?.trim()).toBe('General')
  })
})
