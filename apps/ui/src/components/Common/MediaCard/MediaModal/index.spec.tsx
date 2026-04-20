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

vi.mock('../../../Collection/CollectionDetail/TriggerRuleButton', () => ({
  default: () => <div>trigger-rule-action</div>,
}))

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
      isMediaServerTypeSelected: false,
      isSetupComplete: false,
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
    expect(manualCollectionEntry.className).toContain('text-maintainerr')
    expect(manualCollectionEntry.className).toContain('underline')
    expect(manualCollectionEntry.className).toContain(
      'hover:text-maintainerr-400',
    )
  })

  it('shows only the relevant status card while manual details are loading', async () => {
    const maintainerrStatus = createDeferred<{
      excludedFrom: Array<{ label: string; targetPath?: string }>
      manuallyAddedTo: Array<{ label: string; targetPath?: string }>
    }>()

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
        return maintainerrStatus.promise
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

    expect(await screen.findByText('Manually Added To')).toBeTruthy()
    expect(screen.queryByText('Excluded From')).toBeNull()

    maintainerrStatus.resolve({
      excludedFrom: [],
      manuallyAddedTo: [
        {
          label: 'Testing (5d left)',
          targetPath: '/collections/7',
        },
      ],
    })

    await screen.findByRole('link', { name: 'Testing (5d left)' })
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
    expect(testingCollectionEntry.className).toContain('text-maintainerr')
    expect(testingCollectionEntry.className).toContain('underline')
    expect(testingCollectionEntry.className).toContain(
      'hover:text-maintainerr-400',
    )

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
    expect(fallbackLink.className).toContain('text-maintainerr')
    expect(fallbackLink.className).toContain('underline')
    expect(fallbackLink.className).toContain('hover:text-maintainerr-400')
  })

  it('fetches and shows status when forceStatusLoad is true even for items with no exclusionType or isManual', async () => {
    getApiHandlerMock.mockImplementation((path: string) => {
      if (path === '/media-server') {
        return Promise.resolve({})
      }

      if (path === '/settings') {
        return Promise.resolve({})
      }

      if (path === '/media-server/meta/77') {
        return Promise.resolve({} as MediaItem)
      }

      if (path === '/media-server/meta/77/maintainerr-status') {
        return Promise.resolve({
          excludedFrom: [],
          manuallyAddedTo: [
            {
              label: 'Fresh Collection',
              targetPath: '/collections/20',
            },
          ],
        })
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    render(
      <MediaModal
        onClose={() => {}}
        id={77}
        mediaType="movie"
        title="Movie"
        summary="Movie summary"
        forceStatusLoad={true}
      />,
    )

    const manualHeading = await screen.findByText('Manually Added To')
    expect(manualHeading).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Fresh Collection' })
    expect(link.getAttribute('href')).toBe('/collections/20')
  })

  it('keeps both maintainerr status tiles visible in a two-column grid when both sections are shown', async () => {
    getApiHandlerMock.mockImplementation((path: string) => {
      if (path === '/media-server') {
        return Promise.resolve({})
      }

      if (path === '/settings') {
        return Promise.resolve({})
      }

      if (path === '/media-server/meta/88') {
        return Promise.resolve({} as MediaItem)
      }

      if (path === '/media-server/meta/88/maintainerr-status') {
        return Promise.resolve({
          excludedFrom: [
            {
              label: 'Excluded Collection',
              targetPath: '/collections/88/exclusions',
            },
          ],
          manuallyAddedTo: [
            {
              label: 'Manual Collection',
              targetPath: '/collections/88',
            },
          ],
        })
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    const { container } = render(
      <MediaModal
        onClose={() => {}}
        id={88}
        mediaType="movie"
        title="Movie"
        summary="Movie summary"
        forceStatusLoad={true}
      />,
    )

    expect(await screen.findByText('Excluded From')).toBeTruthy()
    expect(screen.getByText('Manually Added To')).toBeTruthy()

    const detailsGrid = container.querySelector('.mt-4.grid')
    expect(detailsGrid?.className).toContain('grid-cols-2')
  })

  it('shows the trigger rule action control for actionable collection items', async () => {
    getApiHandlerMock.mockImplementation((path: string) => {
      if (path === '/media-server') {
        return Promise.resolve({})
      }

      if (path === '/settings') {
        return Promise.resolve({})
      }

      if (path === '/media-server/meta/91') {
        return Promise.resolve({} as MediaItem)
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    render(
      <MediaModal
        onClose={() => {}}
        id={91}
        mediaType="movie"
        title="Movie"
        summary="Movie summary"
        collection={{
          id: 8,
          title: 'Collection',
          libraryId: '1',
          type: 'movie',
          isActive: true,
          arrAction: 0,
          media: [],
          manualCollection: false,
          manualCollectionName: '',
          addDate: new Date(),
          handledMediaAmount: 0,
          lastDurationInSeconds: 0,
          keepLogsForMonths: 6,
        }}
      />,
    )

    expect(await screen.findByText('trigger-rule-action')).toBeTruthy()
  })

  it('hides the trigger rule action control for excluded collection items', async () => {
    getApiHandlerMock.mockImplementation((path: string) => {
      if (path === '/media-server') {
        return Promise.resolve({})
      }

      if (path === '/settings') {
        return Promise.resolve({})
      }

      if (path === '/media-server/meta/92') {
        return Promise.resolve({} as MediaItem)
      }

      if (path === '/media-server/meta/92/maintainerr-status') {
        return Promise.resolve({
          excludedFrom: [],
          manuallyAddedTo: [],
        })
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    render(
      <MediaModal
        onClose={() => {}}
        id={92}
        mediaType="movie"
        title="Movie"
        summary="Movie summary"
        exclusionType="specific"
        collection={{
          id: 8,
          title: 'Collection',
          libraryId: '1',
          type: 'movie',
          isActive: true,
          arrAction: 0,
          media: [],
          manualCollection: false,
          manualCollectionName: '',
          addDate: new Date(),
          handledMediaAmount: 0,
          lastDurationInSeconds: 0,
          keepLogsForMonths: 6,
        }}
      />,
    )

    await screen.findByText('Excluded From')
    expect(screen.queryByText('trigger-rule-action')).toBeNull()
  })
})
