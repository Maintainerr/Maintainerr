import { MediaServerType } from '@maintainerr/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsWrapper from './index'

const navigate = vi.fn()

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

vi.mock('../Common/LoadingSpinner', () => ({
  default: () => <div>Loading...</div>,
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
    useLocation: () => ({ pathname: '/settings/jellyfin' }),
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
    navigate.mockReset()
    currentSettingsResult = {
      data: undefined,
      isLoading: true,
      error: undefined,
    }
  })

  it('keeps the configured media server tab stable while settings are loading without showing a shell spinner', () => {
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
    expect(screen.queryByText('Loading...')).toBeNull()

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

    expect(screen.queryByText('Loading...')).toBeNull()

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
})
