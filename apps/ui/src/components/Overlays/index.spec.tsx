import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OverlaysWrapper from './index'

const useMediaServerType = vi.fn()
const useOverlaySettings = vi.fn()
const useLocation = vi.fn()

vi.mock('../../hooks/useMediaServerType', () => ({
  useMediaServerType: () => useMediaServerType(),
}))

vi.mock('../../api/overlays', () => ({
  useOverlaySettings: () => useOverlaySettings(),
}))

vi.mock('../Common/LoadingSpinner', () => ({
  default: () => <div>loading</div>,
}))

vi.mock('../Settings/Tabs', () => ({
  default: () => <div data-testid="settings-tabs">tabs</div>,
}))

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">outlet</div>,
    Navigate: ({ to }: { to: string }) => (
      <div data-testid="navigate">{to}</div>
    ),
    useLocation: () => useLocation(),
  }
})

describe('OverlaysWrapper', () => {
  afterEach(() => {
    cleanup()
    useMediaServerType.mockReset()
    useOverlaySettings.mockReset()
    useLocation.mockReset()
  })

  it('keeps the tabs shell visible while the media server type is unresolved', () => {
    useMediaServerType.mockReturnValue({ isLoading: true })
    useOverlaySettings.mockReturnValue({ data: undefined, isLoading: false })
    useLocation.mockReturnValue({ pathname: '/overlays/settings' })

    render(<OverlaysWrapper />)

    expect(screen.getAllByTestId('settings-tabs').length).toBeGreaterThan(0)
    expect(screen.getByText('loading')).toBeTruthy()
    expect(screen.queryByTestId('outlet')).toBeNull()
  })

  it('renders overlay tabs and outlet once the media server type resolves', () => {
    useMediaServerType.mockReturnValue({ isLoading: false })
    useOverlaySettings.mockReturnValue({
      data: { enabled: true, cronSchedule: null },
      isLoading: false,
    })
    useLocation.mockReturnValue({ pathname: '/overlays/settings' })

    render(<OverlaysWrapper />)

    expect(screen.getAllByTestId('settings-tabs').length).toBeGreaterThan(0)
    expect(screen.getByTestId('outlet')).toBeTruthy()
    expect(screen.queryByText('loading')).toBeNull()
  })

  it('redirects away from a templates route while overlays are disabled', () => {
    useMediaServerType.mockReturnValue({ isLoading: false })
    useOverlaySettings.mockReturnValue({
      data: { enabled: false, cronSchedule: null },
      isLoading: false,
    })
    useLocation.mockReturnValue({ pathname: '/overlays/templates' })

    render(<OverlaysWrapper />)

    expect(screen.getByTestId('navigate').textContent).toBe(
      '/overlays/settings',
    )
    expect(screen.queryByTestId('outlet')).toBeNull()
  })

  it('keeps rendering the settings outlet when overlays are disabled', () => {
    useMediaServerType.mockReturnValue({ isLoading: false })
    useOverlaySettings.mockReturnValue({
      data: { enabled: false, cronSchedule: null },
      isLoading: false,
    })
    useLocation.mockReturnValue({ pathname: '/overlays/settings' })

    render(<OverlaysWrapper />)

    expect(screen.getByTestId('outlet')).toBeTruthy()
    expect(screen.queryByTestId('navigate')).toBeNull()
  })
})
