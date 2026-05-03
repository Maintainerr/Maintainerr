import type { StorageMetricsResponse } from '@maintainerr/contracts'
import { MediaServerType } from '@maintainerr/contracts'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GetApiHandler from '../../utils/ApiHandler'
import StorageMetrics from './index'

vi.mock('../../utils/ApiHandler', () => ({
  default: vi.fn(),
}))

vi.mock('../Common/LoadingSpinner', () => ({
  default: () => <div data-testid="storage-metrics-loading" />,
  SmallLoadingSpinner: ({ className }: { className?: string }) => (
    <div className={className} data-testid="storage-metrics-inline-loading" />
  ),
}))

describe('StorageMetrics', () => {
  const getApiHandlerMock = vi.mocked(GetApiHandler)
  let metricsResponse: StorageMetricsResponse

  const renderStorageMetrics = () =>
    render(
      <MemoryRouter>
        <StorageMetrics />
      </MemoryRouter>,
    )

  const createMetricsResponse = (): StorageMetricsResponse => ({
    generatedAt: '2026-04-17T00:00:00.000Z',
    totals: {
      freeSpace: 400,
      totalSpace: 1000,
      usedSpace: 600,
      mountCount: 1,
      accurateMountCount: 1,
      accurateTotalSpace: true,
    },
    mounts: [],
    instances: [],
    mediaServer: {
      configured: true,
      serverType: MediaServerType.PLEX,
      serverName: 'Main Plex',
      reachable: true,
      error: null,
      libraries: [
        {
          id: 'library-1',
          title: 'Movies',
          type: 'movie',
          itemCount: 42,
          sizeBytes: 1234,
        },
      ],
      totalItemCount: 42,
    },
    collectionSummary: {
      activeCount: 1,
      activeSizeBytes: 500,
      activeSizedCount: 1,
      inactiveCount: 0,
      totalCollectionCount: 1,
      movieSizeBytes: 500,
      showSizeBytes: 0,
      movieCollectionCount: 1,
      showCollectionCount: 0,
      reclaimableUsingFallback: false,
    },
    topCollections: [
      {
        id: 7,
        title: 'Soon Gone',
        type: 'movie',
        mediaCount: 3,
        totalSizeBytes: 500,
        isActive: true,
      },
    ],
    cleanupTotals: {
      itemsHandled: 0,
      moviesHandled: 0,
      showsHandled: 0,
      seasonsHandled: 0,
      episodesHandled: 0,
      bytesHandled: 0,
      movieBytesHandled: 0,
      showBytesHandled: 0,
      seasonBytesHandled: 0,
      episodeBytesHandled: 0,
    },
  })

  beforeEach(() => {
    metricsResponse = createMetricsResponse()
    getApiHandlerMock.mockReset()
    getApiHandlerMock.mockImplementation(async (path: string) => {
      if (path === '/storage-metrics') {
        return metricsResponse
      }

      throw new Error(`Unexpected API request: ${path}`)
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses router links for top collections and shows the library size caveat', async () => {
    const { unmount } = renderStorageMetrics()

    try {
      await waitFor(() => {
        expect(screen.getByText('Soon Gone')).toBeTruthy()
      })

      expect(
        screen.getByText('Soon Gone').closest('a')?.getAttribute('href'),
      ).toBe('/collections/7')
      const caveat =
        'Sizes approximate on-disk bytes and may not fully reflect hardlinks, sparse files, or filesystem snapshots.'

      expect(screen.getByText(caveat)).toBeTruthy()
    } finally {
      unmount()
    }
  })

  it('renders cleanup totals with separate show, season, and episode cards', async () => {
    metricsResponse.cleanupTotals = {
      itemsHandled: 18,
      moviesHandled: 3,
      showsHandled: 4,
      seasonsHandled: 5,
      episodesHandled: 6,
      bytesHandled: 1800,
      movieBytesHandled: 300,
      showBytesHandled: 400,
      seasonBytesHandled: 500,
      episodeBytesHandled: 600,
    }

    const { unmount } = renderStorageMetrics()

    try {
      await waitFor(() => {
        expect(screen.getByText('Shows handled')).toBeTruthy()
      })

      expect(screen.getByText('18')).toBeTruthy()

      const moviesCard = screen.getByRole('region', { name: 'Movies handled' })
      const showsCard = screen.getByRole('region', { name: 'Shows handled' })
      const seasonsCard = screen.getByRole('region', {
        name: 'Seasons handled',
      })
      const episodesCard = screen.getByRole('region', {
        name: 'Episodes handled',
      })

      expect(within(moviesCard).getByText('3')).toBeTruthy()
      expect(within(moviesCard).getByText('300 B reclaimed')).toBeTruthy()
      expect(within(showsCard).getByText('4')).toBeTruthy()
      expect(within(showsCard).getByText('400 B reclaimed')).toBeTruthy()
      expect(within(seasonsCard).getByText('5')).toBeTruthy()
      expect(within(seasonsCard).getByText('500 B reclaimed')).toBeTruthy()
      expect(within(episodesCard).getByText('6')).toBeTruthy()
      expect(within(episodesCard).getByText('600 B reclaimed')).toBeTruthy()
    } finally {
      unmount()
    }
  })
})
