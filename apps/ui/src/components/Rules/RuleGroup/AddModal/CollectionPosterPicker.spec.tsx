import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../../../../test-utils/createDeferred'
import {
  uploadCollectionPoster,
  deleteCollectionPoster,
} from '../../../../api/collections'
import CollectionPosterPicker from './CollectionPosterPicker'

vi.mock('../../../../api/collections', () => ({
  buildCollectionPosterUrl: (collectionId: number, cacheBust?: number) => {
    const base = `/api/collections/${collectionId}/poster`
    return cacheBust !== undefined ? `${base}?v=${cacheBust}` : base
  },
  deleteCollectionPoster: vi.fn(),
  uploadCollectionPoster: vi.fn(),
}))

vi.mock('../../../../utils/ClientLogger', () => ({
  logClientError: vi.fn(),
}))

describe('CollectionPosterPicker', () => {
  const uploadCollectionPosterMock = vi.mocked(uploadCollectionPoster)
  const deleteCollectionPosterMock = vi.mocked(deleteCollectionPoster)

  beforeEach(() => {
    uploadCollectionPosterMock.mockReset()
    deleteCollectionPosterMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps an uploaded poster visible when the initial probe resolves stale', async () => {
    const probeDeferred = createDeferred<{ ok: boolean }>()
    const fetchMock = vi.fn<typeof fetch>(
      () => probeDeferred.promise as unknown as Promise<Response>,
    )

    vi.stubGlobal('fetch', fetchMock)
    uploadCollectionPosterMock.mockResolvedValue({
      attempted: true,
      pushed: false,
    })

    render(
      <CollectionPosterPicker
        collectionId={42}
        collectionTerm="collection"
        mediaServerName="Plex"
      />,
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    const [probeUrl, probeInit] = fetchMock.mock.calls[0]
    expect(String(probeUrl)).toMatch(/\/api\/collections\/42\/poster\?v=/)
    expect(probeInit).toEqual(
      expect.objectContaining({
        cache: 'no-store',
        method: 'HEAD',
      }),
    )

    const input = screen.getByTestId('collection-poster-input')
    fireEvent.change(input, {
      target: {
        files: [
          new File(['poster-bytes'], 'poster.png', { type: 'image/png' }),
        ],
      },
    })

    await waitFor(() => {
      expect(uploadCollectionPosterMock).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(
        screen.getByText(
          "Saved locally. Maintainerr couldn't push to Plex right now; it'll re-apply automatically next time the collection is recreated there.",
        ),
      ).toBeTruthy()
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Replace poster')).toBeTruthy()
    expect(screen.getByText('Clear')).toBeTruthy()

    probeDeferred.resolve({ ok: false })

    await waitFor(() => {
      expect(screen.getByText('Replace poster')).toBeTruthy()
    })
    expect(screen.queryByText('No custom poster')).toBeNull()
  })
})
