import { QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '../../../../../test-utils/queryClient'
import { render, screen } from '../../../../../test-utils/render'
import StreamystatsStatsPanel from './'

const getApiHandler = vi.fn()

vi.mock('../../../../../utils/ApiHandler', () => ({
  default: (url: string) => getApiHandler(url),
}))

describe('StreamystatsStatsPanel', () => {
  it('maps the item details onto the shared panel', async () => {
    getApiHandler.mockResolvedValue({
      item: { id: 'abc' },
      totalViews: 12,
      totalWatchTime: 36000,
      completionRate: 92.4,
      firstWatched: '2026-02-01T00:00:00Z',
      lastWatched: '2026-05-15T00:00:00Z',
      usersWatched: [
        {
          user: { id: 'u1', name: null },
          watchCount: 5,
          totalWatchTime: 18000,
          completionRate: 95,
          firstWatched: '2026-02-01T00:00:00Z',
          lastWatched: '2026-05-15T00:00:00Z',
        },
      ],
      watchHistory: [],
      watchCountByMonth: [],
      episodeStats: {
        totalSeasons: 2,
        totalEpisodes: 10,
        watchedEpisodes: 4,
        watchedSeasons: 1,
      },
    })

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <StreamystatsStatsPanel
          itemId="abc"
          itemUrl="http://streamystats.local/servers/1/library/abc"
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('12')).toBeTruthy()
    expect(getApiHandler).toHaveBeenCalledWith('/streamystats/items/abc')
    expect(screen.getByText('92%')).toBeTruthy()
    // Streamystats' copy of the name is nullable, so the id stands in.
    expect(screen.getByText('u1')).toBeTruthy()
    expect(screen.getByText(/4\/10 episodes watched/)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /open on streamystats/i }),
    ).toHaveProperty('href', 'http://streamystats.local/servers/1/library/abc')
  })
})
