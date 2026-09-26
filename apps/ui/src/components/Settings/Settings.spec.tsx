import { MediaServerType } from '@maintainerr/contracts'
import type { UseQueryResult } from '@tanstack/react-query'
import {
  buildQueryLoadingResult,
  buildQuerySuccessResult,
} from '../../test-utils/queryResults'
import { fireEvent, render, screen } from '../../test-utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsWrapper from './index'

const navigate = vi.fn()
const toastError = vi.fn()

let currentPath = '/settings/main'

type SettingsData = {
  media_server_type?: MediaServerType | null
  plex_auth_token: string | null
  jellyfin_url?: string
  jellyfin_api_key?: string
}

let currentSettingsResult: UseQueryResult<SettingsData>
let currentServarrSettings = buildQuerySuccessResult<{ id: number }[]>([])

vi.mock('../../api/settings', () => ({
  useSettings: () => currentSettingsResult,
  useServarrSettings: () => currentServarrSettings,
}))

vi.mock('../../api/notifications', () => ({
  useNotificationConfigurations: () => buildQuerySuccessResult([]),
}))

vi.mock('../Common/Alert', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('../../router', () => ({
  prefetchHandlers: () => ({}),
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

const getDesktopTabLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('nav.flex a')).map((link) =>
    link.textContent?.trim(),
  )

const jellyfin = {
  media_server_type: MediaServerType.JELLYFIN,
  plex_auth_token: null,
  jellyfin_url: 'http://jellyfin.local',
  jellyfin_api_key: 'token',
}
const noServer = { media_server_type: null, plex_auth_token: null }

const loaded = (data: SettingsData) => {
  currentSettingsResult = buildQuerySuccessResult(data)
}

describe('SettingsWrapper', () => {
  beforeEach(() => {
    toastError.mockReset()
    currentPath = '/settings/main'
    loaded(jellyfin)
    currentServarrSettings = buildQuerySuccessResult([])
  })

  it('keeps only the general settings tabs in the settings section', () => {
    const { container } = render(<SettingsWrapper />)

    expect(getDesktopTabLabels(container)).toEqual([
      'General',
      'Logs',
      'Jobs',
      'About',
    ])
  })

  it('keeps the tab row in place while settings load', () => {
    currentSettingsResult = buildQueryLoadingResult()

    const { container } = render(<SettingsWrapper />)

    expect(getDesktopTabLabels(container)).toEqual([
      'General',
      'Logs',
      'Jobs',
      'About',
    ])
  })

  it('redirects blocked routes to the media server page with an error toast during first setup', () => {
    currentPath = '/settings/jobs'
    loaded(noServer)

    render(<SettingsWrapper />)

    expect(toastError).toHaveBeenCalledWith(
      'You need to set up the media server first.',
      expect.any(Object),
    )
    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe(
      '/services/media-server',
    )
  })

  it.each([
    ['/services', 'services', '/services/media-server'],
    ['/settings', 'settings', '/settings/logs'],
    ['/settings/main', 'settings', '/services/media-server'],
  ] as const)(
    'opens %s on the page usable during setup',
    (path, section, target) => {
      currentPath = path
      loaded(noServer)

      render(<SettingsWrapper section={section} />)

      expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe(
        target,
      )
    },
  )

  it('shows the welcome modal on the media server page only, until a server is chosen', () => {
    loaded(noServer)
    const { rerender } = render(<SettingsWrapper />)
    expect(screen.queryByText('Welcome to Maintainerr!')).toBeNull()

    currentPath = '/services/media-server'
    rerender(<SettingsWrapper section="services" />)
    expect(screen.getByText('Welcome to Maintainerr!')).toBeTruthy()
    expect(screen.queryByTestId('navigate')).toBeNull()

    loaded({ ...noServer, media_server_type: MediaServerType.JELLYFIN })
    rerender(<SettingsWrapper section="services" />)
    expect(screen.queryByText('Welcome to Maintainerr!')).toBeNull()
  })

  it('lists the services for the configured server in the switcher', () => {
    currentPath = '/services/seerr'

    const { container, rerender } = render(
      <SettingsWrapper section="services" />,
    )

    expect(getDesktopTabLabels(container)).toEqual([
      'Jellyfin',
      'Seerr',
      'Ombi',
      'Radarr',
      'Sonarr',
      'Sportarr',
      'Metadata',
      'Tracearr',
      'Streamystats',
      'Notifications',
    ])
    expect(
      screen.getByRole('link', { name: 'Jellyfin' }).getAttribute('href'),
    ).toBe('/services/media-server')
    expect(screen.getByRole('heading', { name: 'Seerr' })).toBeTruthy()

    currentServarrSettings = buildQuerySuccessResult([{ id: 1 }])
    rerender(<SettingsWrapper section="services" />)
    expect(getDesktopTabLabels(container)).toContain('Download client')
  })

  it('shows no switcher on the services hub', () => {
    currentPath = '/services'

    const { container } = render(<SettingsWrapper section="services" />)

    expect(getDesktopTabLabels(container)).toEqual([])
  })

  it('keeps the media server reachable and blocks other services during setup', () => {
    currentPath = '/services/media-server'
    loaded({ ...noServer, media_server_type: MediaServerType.JELLYFIN })

    render(<SettingsWrapper section="services" />)

    expect(
      screen
        .getByRole('link', { name: 'Jellyfin' })
        .getAttribute('aria-disabled'),
    ).toBe('false')
    expect(
      (screen.getByRole('option', { name: 'Sonarr' }) as HTMLOptionElement)
        .disabled,
    ).toBe(true)

    fireEvent.click(screen.getByRole('link', { name: 'Sonarr' }))
    expect(toastError).toHaveBeenCalledWith(
      'You need to set up the media server first.',
      expect.any(Object),
    )
  })
})
