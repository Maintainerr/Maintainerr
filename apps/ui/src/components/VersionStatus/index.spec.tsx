import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VersionStatus from './index'

const getApiHandler = vi.fn()
const isRouteBlocked = vi.fn()
const showBlockedNavigationToast = vi.fn()
const prefetchRoute = vi.fn()

vi.mock('../../utils/ApiHandler', () => ({
  default: (...args: unknown[]) => getApiHandler(...args),
}))

vi.mock('../../router', () => ({
  prefetchRoute: (...args: unknown[]) => prefetchRoute(...args),
}))

vi.mock('../Layout/MediaServerSetupGuard', () => ({
  useMediaServerSetupNavigationGuard: () => ({
    isRouteBlocked: (...args: unknown[]) => isRouteBlocked(...args),
    showBlockedNavigationToast: (...args: unknown[]) =>
      showBlockedNavigationToast(...args),
  }),
}))

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

describe('VersionStatus', () => {
  beforeEach(() => {
    getApiHandler.mockReset()
    isRouteBlocked.mockReset()
    showBlockedNavigationToast.mockReset()
    prefetchRoute.mockReset()

    getApiHandler.mockResolvedValue({
      status: true,
      version: '1.2.3',
      commitTag: 'v1.2.3',
      updateAvailable: false,
    })
    isRouteBlocked.mockReturnValue(false)
  })

  afterEach(() => {
    cleanup()
  })

  it('blocks navigation to about when setup guard blocks the route', async () => {
    isRouteBlocked.mockReturnValue(true)

    render(<VersionStatus />)

    const link = await screen.findByRole('button')

    fireEvent.click(link)

    expect(showBlockedNavigationToast).toHaveBeenCalledTimes(1)
  })

  it('prefetches the about route when navigation is allowed', async () => {
    render(<VersionStatus />)

    const link = await screen.findByRole('button')

    fireEvent.mouseEnter(link)

    await waitFor(() => {
      expect(prefetchRoute).toHaveBeenCalledWith('/settings/about')
    })
  })
})
