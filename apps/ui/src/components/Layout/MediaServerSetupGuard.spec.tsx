import { render, screen } from '../../test-utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MediaServerSetupGuard, {
  isAllowedDuringMediaServerSetup,
} from './MediaServerSetupGuard'

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
    useMediaServerType.mockReset()
    toastError.mockReset()
  })

  it('redirects to the media server page outside development when setup is incomplete', () => {
    useMediaServerType.mockReturnValue({
      isLoading: false,
      isNotConfigured: true,
    })

    render(<MediaServerSetupGuard />)

    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe(
      '/services/media-server',
    )
    expect(toastError).not.toHaveBeenCalled()
  })

  it('renders the outlet when setup is complete', () => {
    useMediaServerType.mockReturnValue({
      isLoading: false,
      isNotConfigured: false,
    })

    render(<MediaServerSetupGuard />)

    expect(screen.getByTestId('outlet')).toBeTruthy()
    expect(screen.queryByTestId('navigate')).toBeNull()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('allows the logs page during setup', () => {
    expect(isAllowedDuringMediaServerSetup('/settings/logs')).toBe(true)
    expect(isAllowedDuringMediaServerSetup('/settings/logs/live')).toBe(true)
  })

  it('allows the media server page but no other service or settings page during setup', () => {
    expect(isAllowedDuringMediaServerSetup('/services/media-server')).toBe(true)
    expect(isAllowedDuringMediaServerSetup('/services/radarr')).toBe(false)
    expect(isAllowedDuringMediaServerSetup('/settings/main')).toBe(false)
  })
})
