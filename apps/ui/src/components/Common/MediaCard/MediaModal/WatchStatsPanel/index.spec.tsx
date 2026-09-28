import type { MediaWatchStats } from '@maintainerr/contracts'
import { QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, type AxiosResponse } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '../../../../../test-utils/queryClient'
import { render, screen } from '../../../../../test-utils/render'
import WatchStatsPanel from './'

const getApiHandler = vi.fn()

vi.mock('../../../../../utils/ApiHandler', () => ({
  default: (url: string) => getApiHandler(url),
}))

const stats: MediaWatchStats = {
  url: 'http://tautulli.local/info?rating_key=1',
  plays: 4,
  watchTime: 5400,
  lastWatched: '2026-05-15T00:00:00Z',
  users: [{ name: 'alice', plays: 4, watchTime: 5400, lastWatched: null }],
}

const renderPanel = () =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WatchStatsPanel
        name="Tautulli"
        path="/tautulli/items/1"
        toView={(data: MediaWatchStats) => data}
      />
    </QueryClientProvider>,
  )

describe('WatchStatsPanel', () => {
  beforeEach(() => {
    getApiHandler.mockReset()
  })

  it('renders the totals, the per-user table and the item link', async () => {
    getApiHandler.mockResolvedValue(stats)

    renderPanel()

    expect(await screen.findByText('alice')).toBeTruthy()
    expect(screen.getAllByText('1h 30m')).toHaveLength(2)
    expect(
      screen.getByRole('link', { name: /open on tautulli/i }),
    ).toHaveProperty('href', stats.url)
    // No user carries a date, so the table has no column of dashes.
    expect(screen.getAllByText('Last watched')).toHaveLength(1)
  })

  it('reads a 404 as an item nobody watched, not as a failure', async () => {
    getApiHandler.mockRejectedValue(
      new AxiosError('Not Found', undefined, undefined, undefined, {
        status: 404,
      } as AxiosResponse),
    )

    renderPanel()

    expect(await screen.findByText(/no watch history/i)).toBeTruthy()
  })

  it('shows an inline error when the service could not be read', async () => {
    getApiHandler.mockRejectedValue(new Error('boom'))

    renderPanel()

    expect(await screen.findByText(/failed to load tautulli/i)).toBeTruthy()
  })

  it('reserves vertical space so the modal layout does not jump', () => {
    getApiHandler.mockReturnValue(new Promise(() => {}))

    const { container } = renderPanel()

    expect((container.firstChild as HTMLElement).className).toMatch(/min-h-/)
  })
})
