import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OverlaysWrapper from './index'

const useMediaServerType = vi.fn()

vi.mock('../../hooks/useMediaServerType', () => ({
  useMediaServerType: () => useMediaServerType(),
}))

vi.mock('../Common/LoadingSpinner', () => ({
  default: () => <div>loading</div>,
}))

vi.mock('../Common/Alert', () => ({
  default: ({
    title,
    children,
  }: {
    title?: string
    children?: React.ReactNode
  }) => (
    <div>
      {title ? <div>{title}</div> : null}
      {children ? <div>{children}</div> : null}
    </div>
  ),
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
  }
})

describe('OverlaysWrapper', () => {
  it('keeps the tabs shell visible while the media server type is unresolved', () => {
    useMediaServerType.mockReturnValue({ isLoading: true, isPlex: false })

    render(<OverlaysWrapper />)

    expect(screen.getAllByTestId('settings-tabs').length).toBeGreaterThan(0)
    expect(screen.getByText('loading')).toBeTruthy()
  })

  it('shows an inline unsupported-state message for non-Plex media servers', () => {
    useMediaServerType.mockReturnValue({ isLoading: false, isPlex: false })

    render(<OverlaysWrapper />)

    expect(screen.getAllByTestId('settings-tabs').length).toBeGreaterThan(0)
    expect(screen.getByText('Overlays currently require Plex')).toBeTruthy()
    expect(
      screen.getByText(
        'Switch the media server to Plex to configure overlay settings and templates.',
      ),
    )
    expect(screen.queryByTestId('outlet')).toBeNull()
  })

  it('renders overlay tabs and outlet for Plex', () => {
    useMediaServerType.mockReturnValue({ isLoading: false, isPlex: true })

    render(<OverlaysWrapper />)

    expect(screen.getAllByTestId('settings-tabs').length).toBeGreaterThan(0)
    expect(screen.getByTestId('outlet')).toBeTruthy()
  })
})
