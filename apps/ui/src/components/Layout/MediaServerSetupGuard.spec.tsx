import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toastError = vi.fn()
const useMediaServerType = vi.fn()

vi.mock('../../hooks/useMediaServerType', () => ({
  useMediaServerType: () => useMediaServerType(),
}))

vi.mock('../Common/LoadingSpinner', () => ({
  default: () => <div>loading</div>,
}))

vi.mock('react-toastify', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
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
    Outlet: () => <div data-testid="outlet">outlet</div>,
  }
})

describe('MediaServerSetupGuard', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    useMediaServerType.mockReset()
    toastError.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
  })

  it('redirects to settings outside development when setup is incomplete', async () => {
    vi.stubEnv('MODE', 'test')
    useMediaServerType.mockReturnValue({
      isLoading: false,
      isNotConfigured: true,
    })

    const { default: MediaServerSetupGuard } =
      await import('./MediaServerSetupGuard')

    render(<MediaServerSetupGuard />)

    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe(
      '/settings/main',
    )
    expect(toastError).toHaveBeenCalledWith(
      'You need to set up the media server first.',
      expect.any(Object),
    )
  })

  it('renders the outlet when setup is complete', async () => {
    vi.stubEnv('MODE', 'test')
    useMediaServerType.mockReturnValue({
      isLoading: false,
      isNotConfigured: false,
    })

    const { default: MediaServerSetupGuard } =
      await import('./MediaServerSetupGuard')

    render(<MediaServerSetupGuard />)

    expect(screen.getByTestId('outlet')).toBeTruthy()
    expect(screen.queryByTestId('navigate')).toBeNull()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('allows the logs page during setup', async () => {
    const { isAllowedDuringMediaServerSetup } =
      await import('./MediaServerSetupGuard')

    expect(isAllowedDuringMediaServerSetup('/settings/logs')).toBe(true)
    expect(isAllowedDuringMediaServerSetup('/settings/logs/live')).toBe(true)
  })

  it('skips the guard entirely in development mode', async () => {
    vi.stubEnv('MODE', 'development')
    useMediaServerType.mockReturnValue({
      isLoading: false,
      isNotConfigured: true,
    })

    const { default: MediaServerSetupGuard } =
      await import('./MediaServerSetupGuard')

    render(<MediaServerSetupGuard />)

    expect(screen.getByTestId('outlet')).toBeTruthy()
    expect(screen.queryByTestId('navigate')).toBeNull()
    expect(toastError).not.toHaveBeenCalled()
  })
})
