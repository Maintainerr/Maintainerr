import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StreamystatsSettings from './index'

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

describe('StreamystatsSettings', () => {
  beforeEach(() => {
    cleanup()
    useMediaServerTypeMock.mockReset()
    getApiHandler.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing while settings are loading', () => {
    useMediaServerTypeMock.mockReturnValue({
      isJellyfin: false,
      isLoading: true,
    })

    const { container } = render(<StreamystatsSettings />)
    expect(container.firstChild).toBeNull()
    expect(getApiHandler).not.toHaveBeenCalled()
  })

  it('redirects to /settings/main when the active server is Plex', () => {
    useMediaServerTypeMock.mockReturnValue({
      isJellyfin: false,
      isLoading: false,
    })

    render(<StreamystatsSettings />)

    const nav = screen.getByTestId('navigate')
    expect(nav.getAttribute('data-to')).toBe('/settings/main')
    // The settings form must not mount, so its initial GET must not fire.
    expect(getApiHandler).not.toHaveBeenCalled()
  })

  it('redirects to /settings/main when the active server is Emby', () => {
    useMediaServerTypeMock.mockReturnValue({
      isJellyfin: false,
      isLoading: false,
    })

    render(<StreamystatsSettings />)

    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe(
      '/settings/main',
    )
    expect(getApiHandler).not.toHaveBeenCalled()
  })

  it('renders the settings form when the active server is Jellyfin', async () => {
    useMediaServerTypeMock.mockReturnValue({
      isJellyfin: true,
      isLoading: false,
    })
    getApiHandler.mockResolvedValue({ url: '' })

    render(<StreamystatsSettings />)

    await waitFor(() => {
      expect(screen.queryByTestId('navigate')).toBeNull()
    })
    expect(getApiHandler).toHaveBeenCalledWith('/settings/streamystats')
  })
})
