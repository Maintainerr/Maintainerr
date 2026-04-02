import type { MediaItem } from '@maintainerr/contracts'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMediaServerType } from '../../../../hooks/useMediaServerType'
import { createDeferred } from '../../../../test-utils/createDeferred'
import GetApiHandler from '../../../../utils/ApiHandler'
import MediaModal from './index'

vi.mock('../../../../hooks/useMediaServerType', () => ({
  useMediaServerType: vi.fn(),
}))

vi.mock('../../../../utils/ApiHandler', () => ({
  default: vi.fn(),
}))

vi.mock('../../../../utils/ClientLogger', () => ({
  logClientError: vi.fn(),
}))

describe('MediaModal', () => {
  const useMediaServerTypeMock = vi.mocked(useMediaServerType)
  const getApiHandlerMock = vi.mocked(GetApiHandler)

  beforeEach(() => {
    useMediaServerTypeMock.mockReset()
    getApiHandlerMock.mockReset()

    useMediaServerTypeMock.mockReturnValue({
      isPlex: false,
      isJellyfin: false,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('clears the previous provider badge until the current backdrop request resolves', async () => {
    const firstBackdrop = createDeferred<{
      url: string
      provider: string
      id: number
    }>()
    const secondBackdrop = createDeferred<{
      url: string
      provider: string
      id: number
    }>()

    getApiHandlerMock.mockImplementation((path: string) => {
      if (path === '/media-server') {
        return Promise.resolve({})
      }

      if (path === '/settings') {
        return Promise.resolve({})
      }

      if (path === '/media-server/meta/1' || path === '/media-server/meta/2') {
        return Promise.resolve({} as MediaItem)
      }

      if (path.startsWith('/metadata/backdrop/movie?')) {
        return firstBackdrop.promise
      }

      if (path.startsWith('/metadata/backdrop/show?')) {
        return secondBackdrop.promise
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    const { rerender } = render(
      <MediaModal
        onClose={() => {}}
        id={1}
        mediaType="movie"
        title="Movie"
        summary="Movie summary"
        providerIds={{ tmdb: ['101'] }}
      />,
    )

    firstBackdrop.resolve({
      url: 'https://image.example/movie.jpg',
      provider: 'TMDB',
      id: 101,
    })

    const tmdbLogo = await screen.findByRole('img', { name: 'TMDB Logo' })
    expect(tmdbLogo.closest('a')?.getAttribute('href')).toBe(
      'https://themoviedb.org/movie/101',
    )

    rerender(
      <MediaModal
        onClose={() => {}}
        id={2}
        mediaType="show"
        title="Show"
        summary="Show summary"
        providerIds={{ tvdb: ['202'] }}
      />,
    )

    await waitFor(() => {
      expect(screen.queryByRole('img', { name: 'TMDB Logo' })).toBeNull()
      expect(screen.queryByRole('img', { name: 'TheTVDB Logo' })).toBeNull()
    })

    secondBackdrop.resolve({
      url: 'https://image.example/show.jpg',
      provider: 'TVDB',
      id: 202,
    })

    const tvdbLogo = await screen.findByRole('img', { name: 'TheTVDB Logo' })
    expect(tvdbLogo.closest('a')?.getAttribute('href')).toBe(
      'https://thetvdb.com/dereferrer/series/202',
    )
  })
})
