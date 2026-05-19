import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StreamystatsStatsPanel from './'

const getApiHandler = vi.fn()

vi.mock('../../../../../utils/ApiHandler', () => ({
  default: (url: string) => getApiHandler(url),
}))

describe('StreamystatsStatsPanel', () => {
  beforeEach(() => {
    cleanup()
    getApiHandler.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders aggregate stats and per-user table on a valid response', async () => {
    getApiHandler.mockResolvedValue({
      item: { id: 'abc' },
      totalViews: 12,
      totalWatchTime: 36000,
      completionRate: 92.4,
      firstWatched: '2026-02-01T00:00:00Z',
      lastWatched: '2026-05-15T00:00:00Z',
      usersWatched: [
        {
          user: { id: 'u1', name: 'alice' },
          watchCount: 5,
          totalWatchTime: 18000,
          completionRate: 95,
          firstWatched: '2026-02-01T00:00:00Z',
          lastWatched: '2026-05-15T00:00:00Z',
        },
      ],
      watchHistory: [],
      watchCountByMonth: [],
    })

    render(<StreamystatsStatsPanel itemId="abc" />)

    await waitFor(() => {
      expect(screen.getByText('12')).toBeTruthy()
    })

    expect(screen.getByText('92%')).toBeTruthy()
    expect(screen.getByText('alice')).toBeTruthy()
  })

  it('shows an empty-state message when no data exists for the item (404)', async () => {
    getApiHandler.mockRejectedValue(new Error('404 not found'))

    render(<StreamystatsStatsPanel itemId="abc" />)

    await waitFor(() => {
      expect(screen.getByText(/no watch history/i)).toBeTruthy()
    })
  })

  it('shows an inline error message when the fetch fails for unexpected reasons', async () => {
    getApiHandler.mockRejectedValue(new Error('boom'))

    render(<StreamystatsStatsPanel itemId="abc" />)

    await waitFor(() => {
      expect(screen.getByText(/failed to load streamystats/i)).toBeTruthy()
    })
  })

  it('reserves vertical space so the modal layout does not jump', () => {
    getApiHandler.mockReturnValue(new Promise(() => {}))
    const { container } = render(<StreamystatsStatsPanel itemId="abc" />)
    const panel = container.firstChild as HTMLElement
    expect(panel?.className).toMatch(/min-h-/)
  })
})
