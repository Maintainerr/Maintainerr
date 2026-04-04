import type { MediaItem } from '@maintainerr/contracts'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMediaServerType } from '../../../../hooks/useMediaServerType'
import { createDeferred } from '../../../../test-utils/createDeferred'
import GetApiHandler from '../../../../utils/ApiHandler'
import { clearMaintainerrStatusDetailsCache } from '../maintainerrStatus'
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
    clearMaintainerrStatusDetailsCache()

    useMediaServerTypeMock.mockReturnValue({
      mediaServerType: null,
      isLoading: false,
      isPlex: false,
      isJellyfin: false,
      isNotConfigured: true,
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

  it('merges fetched provider ids with incoming ids so a TVDB primary backdrop can resolve later', async () => {
    getApiHandlerMock.mockImplementation((path: string) => {
      if (path === '/media-server') {
        return Promise.resolve({})
      }

      if (path === '/settings') {
        return Promise.resolve({})
      }

      if (path === '/media-server/meta/2') {
        return Promise.resolve({
          providerIds: {
            tmdb: ['101'],
            tvdb: ['202'],
          },
        } as MediaItem)
      }

      if (path.startsWith('/metadata/backdrop/show?')) {
        return Promise.resolve({
          url: 'https://image.example/show.jpg',
          provider: 'TVDB',
          id: 202,
        })
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    render(
      <MediaModal
        onClose={() => {}}
        id={2}
        mediaType="show"
        title="Show"
        summary="Show summary"
        providerIds={{ tmdb: ['101'] }}
      />,
    )

    const tvdbLogo = await screen.findByRole('img', { name: 'TheTVDB Logo' })

    expect(tvdbLogo.closest('a')?.getAttribute('href')).toBe(
      'https://thetvdb.com/dereferrer/series/202',
    )
    expect(await screen.findByText('tvdb://202')).toBeTruthy()
  })

  it('shows maintainerr status for manually added items', async () => {
    getApiHandlerMock.mockImplementation((path: string) => {
      if (path === '/media-server') {
        return Promise.resolve({})
      }

      if (path === '/settings') {
        return Promise.resolve({})
      }

      if (path === '/media-server/meta/9') {
        return Promise.resolve({} as MediaItem)
      }

      if (path === '/media-server/meta/9/maintainerr-status') {
        return Promise.resolve({
          excludedFrom: [],
          manuallyAddedTo: [
            {
              label: 'Testing (5d left)',
              targetPath: '/collections/7',
            },
          ],
        })
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    render(
      <MediaModal
        onClose={() => {}}
        id={9}
        mediaType="movie"
        title="Movie"
        summary="Movie summary"
        isManual={true}
      />,
    )

    const manualHeading = await screen.findByText('Manually Added To')
    expect(manualHeading).toBeTruthy()
    expect(manualHeading.className).toContain('text-white')
    expect(manualHeading.parentElement?.className).toContain('bg-zinc-900/70')
    const manualCollectionEntry = screen.getByRole('link', {
      name: 'Testing (5d left)',
    })

    expect(manualCollectionEntry.getAttribute('href')).toBe('/collections/7')
    expect(manualCollectionEntry.className).toContain('text-amber-500')
    expect(manualCollectionEntry.className).toContain('underline')
    expect(manualCollectionEntry.className).toContain('hover:text-amber-400')
  })

  it('renders exclusion list entries and follows status links', async () => {
    const onStatusLink = vi.fn()

    getApiHandlerMock.mockImplementation((path: string) => {
      if (path === '/media-server') {
        return Promise.resolve({})
      }

      if (path === '/settings') {
        return Promise.resolve({})
      }

      if (path === '/media-server/meta/1') {
        return Promise.resolve({} as MediaItem)
      }

      if (path === '/media-server/meta/1/maintainerr-status') {
        return Promise.resolve({
          excludedFrom: [
            { label: 'Global' },
            {
              label: 'Testing1',
              targetPath: '/collections/42/exclusions',
            },
          ],
          manuallyAddedTo: [],
        })
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    render(
      <MediaModal
        onClose={() => {}}
        id={1}
        mediaType="movie"
        title="Movie"
        summary="Movie summary"
        exclusionType="specific"
        onStatusLink={onStatusLink}
      />,
    )

    const testingCollectionEntry = await screen.findByRole('button', {
      name: 'Testing1',
    })

    expect(screen.getByText('Global')).toBeTruthy()
    const excludedHeading = screen.getByText('Excluded From')
    expect(excludedHeading.className).toContain('text-white')
    expect(excludedHeading.parentElement?.className).toContain('bg-zinc-900/70')
    expect(testingCollectionEntry.className).toContain('text-amber-500')
    expect(testingCollectionEntry.className).toContain('underline')
    expect(testingCollectionEntry.className).toContain('hover:text-amber-400')

    fireEvent.click(testingCollectionEntry)

    expect(onStatusLink).toHaveBeenCalledWith('/collections/42/exclusions')
  })

  it('renders fallback links when status navigation callback is not provided', async () => {
    getApiHandlerMock.mockImplementation((path: string) => {
      if (path === '/media-server') {
        return Promise.resolve({})
      }

      if (path === '/settings') {
        return Promise.resolve({})
      }

      if (path === '/media-server/meta/5') {
        return Promise.resolve({} as MediaItem)
      }

      if (path === '/media-server/meta/5/maintainerr-status') {
        return Promise.resolve({
          excludedFrom: [
            {
              label: 'Testing2',
              targetPath: '/collections/99/exclusions',
            },
          ],
          manuallyAddedTo: [],
        })
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    render(
      <MediaModal
        onClose={() => {}}
        id={5}
        mediaType="movie"
        title="Movie"
        summary="Movie summary"
        exclusionType="specific"
      />,
    )

    const fallbackLink = await screen.findByRole('link', {
      name: 'Testing2',
    })

    expect(fallbackLink.getAttribute('href')).toBe('/collections/99/exclusions')
    expect(fallbackLink.className).toContain('text-amber-500')
    expect(fallbackLink.className).toContain('underline')
    expect(fallbackLink.className).toContain('hover:text-amber-400')
  })
})
