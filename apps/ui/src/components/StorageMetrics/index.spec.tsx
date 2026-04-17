import type { StorageMetricsResponse } from '@maintainerr/contracts'
import { MediaServerType } from '@maintainerr/contracts'
import { render, screen, waitFor } from '@testing-library/react'
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

  const metricsResponse: StorageMetricsResponse = {
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
  }

  beforeEach(() => {
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
    render(
      <MemoryRouter>
        <StorageMetrics />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Soon Gone')).toBeTruthy()
    })

    expect(
      screen.getByText('Soon Gone').closest('a')?.getAttribute('href'),
    ).toBe('/collections/7')
    const caveat =
      'Sizes approximate on-disk bytes and may not fully reflect hardlinks, sparse files, or filesystem snapshots.'

    expect(screen.getByText(caveat)).toBeTruthy()
  })
})
