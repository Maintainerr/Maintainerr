import { MediaServerType } from '@maintainerr/contracts'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INTERACTION_DEBOUNCE_MS } from '../../utils/uiBehavior'
import SettingsWrapper from './index'

const navigate = vi.fn()
const toastError = vi.fn()

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

vi.mock('react-toastify', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    dismiss: vi.fn(),
  },
}))

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => (
      <div data-testid="navigate" data-to={to} />
    ),
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
    toastError.mockReset()
    currentPath = getMediaServerSettingsPath(MediaServerType.JELLYFIN)
    currentSettingsResult = {
      data: undefined,
      isLoading: true,
      error: undefined,
    }
  })

  afterEach(() => {
    cleanup()
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
      link.className.includes('text-maintainerr'),
    )

    expect(activeLinks).toHaveLength(1)
    expect(activeLinks[0]?.textContent?.trim()).toBe('General')
  })

  it('redirects blocked settings routes to general with an error toast when no media server is selected', () => {
    currentPath = '/settings/sonarr'
    currentSettingsResult = {
      data: {
        media_server_type: null,
        plex_auth_token: null,
      },
      isLoading: false,
      error: undefined,
    }

    render(<SettingsWrapper />)

    expect(toastError).toHaveBeenCalledWith(
      'You need to set up the media server first.',
      expect.any(Object),
    )

    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe(
      '/settings/main',
    )
  })

  it('keeps blocked settings tabs disabled in the mobile selector during first setup', () => {
    currentPath = '/settings/main'
    currentSettingsResult = {
      data: {
        media_server_type: null,
        plex_auth_token: null,
      },
      isLoading: false,
      error: undefined,
    }

    render(<SettingsWrapper />)

    expect(
      (screen.getByRole('option', { name: 'Sonarr' }) as HTMLOptionElement)
        .disabled,
    ).toBe(true)
  })

  it('shows an error toast when a blocked settings tab is clicked during first setup', () => {
    currentPath = '/settings/main'
    currentSettingsResult = {
      data: {
        media_server_type: null,
        plex_auth_token: null,
      },
      isLoading: false,
      error: undefined,
    }

    render(<SettingsWrapper />)

    const blockedSonarrLink = screen
      .getAllByRole('link', { name: 'Sonarr' })
      .find((link) => link.getAttribute('aria-disabled') === 'true')

    expect(blockedSonarrLink).toBeDefined()

    fireEvent.click(blockedSonarrLink as HTMLElement)

    expect(toastError).toHaveBeenCalledWith(
      'You need to set up the media server first.',
      expect.any(Object),
    )
  })
})
