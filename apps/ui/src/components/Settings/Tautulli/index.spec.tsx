import { render, screen, waitFor } from '../../../test-utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TautulliSettings from './index'

const useMediaServerTypeMock = vi.fn()
const getApiHandler = vi.fn()

vi.mock('../../../hooks/useMediaServerType', () => ({
  useMediaServerType: () => useMediaServerTypeMock(),
}))

vi.mock('../../../utils/ApiHandler', () => ({
  default: (url: string) => getApiHandler(url),
  PostApiHandler: vi.fn(),
  DeleteApiHandler: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => (
      <div data-testid="navigate" data-to={to} />
    ),
  }
})

vi.mock('../../Common/DocsButton', () => ({
  default: () => <button type="button">Docs</button>,
}))

describe('TautulliSettings', () => {
  beforeEach(() => {
    useMediaServerTypeMock.mockReset()
    getApiHandler.mockReset()
  })

  it('redirects to the services hub when the active server is not Plex', () => {
    useMediaServerTypeMock.mockReturnValue({ isPlex: false, isLoading: false })

    render(<TautulliSettings />)

    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe(
      '/services',
    )
    expect(getApiHandler).not.toHaveBeenCalled()
  })

  it('renders the settings form when the active server is Plex', async () => {
    useMediaServerTypeMock.mockReturnValue({ isPlex: true, isLoading: false })
    getApiHandler.mockResolvedValue({ url: '' })

    render(<TautulliSettings />)

    await waitFor(() => {
      expect(getApiHandler).toHaveBeenCalledWith('/settings/tautulli')
    })
    expect(screen.queryByTestId('navigate')).toBeNull()
  })
})
