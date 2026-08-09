import { MediaServerType, type MediaLibrary } from '@maintainerr/contracts'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'react-toastify'
import { SearchContextProvider } from '../../contexts/search-context'
import { useMediaServerType } from '../../hooks/useMediaServerType'
import GetApiHandler from '../../utils/ApiHandler'
import {
  getCollectionMediaSortConfig,
  getMediaLibrarySortConfig,
} from '../Common/MediaLibrarySortControl'
import type { MediaActionOutcome } from '../Common/MediaActionModal'
import Overview, { buildLibraryContentQuery } from './index'

vi.mock('../../utils/ApiHandler', () => ({
  default: vi.fn(),
}))

vi.mock('../../hooks/useMediaServerType', () => ({
  useMediaServerType: vi.fn(),
}))

// The shared modal has its own spec; this only hands back an outcome.
let submittedOutcome: MediaActionOutcome = {
  action: 'exclusion-add',
  succeededIds: [],
  failedIds: [],
}

vi.mock('../Common/MediaActionModal', () => ({
  default: ({
    onSubmitted,
  }: {
    onSubmitted: (outcome: MediaActionOutcome) => void
  }) => (
    <button
      data-testid="media-action-submit"
      onClick={() => onSubmitted(submittedOutcome)}
    >
      Submit
    </button>
  ),
}))

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('../Common/LibrarySwitcher', () => ({
  default: () => null,
}))

vi.mock('../Common/LoadingSpinner', () => ({
  default: () => <div data-testid="overview-bootstrap-spinner" />,
  SmallLoadingSpinner: () => <div data-testid="overview-refresh-spinner" />,
}))

vi.mock('./Content', () => ({
  default: ({
    data,
    fetchData,
    loading,
    selectionMode,
    selectedMediaIds,
    onToggleSelection,
  }: {
    data: Array<{ id: string; title: string }>
    fetchData: () => void
    loading: boolean
    selectionMode?: boolean
    selectedMediaIds?: ReadonlySet<string>
    onToggleSelection?: (mediaId: string, selected: boolean) => void
  }) => (
    <div>
      {loading ? <span data-testid="overview-content-loading" /> : null}
      <button data-testid="overview-fetch-more" onClick={() => fetchData()}>
        Fetch more
      </button>
      <div data-testid="overview-items">
        {data.map((item) => (
          <span key={item.id}>
            {item.title}
            <span data-testid={`overview-exclusion-${item.id}`}>
              {(item as { maintainerrExclusionType?: string })
                .maintainerrExclusionType ?? 'none'}
            </span>
            {selectionMode ? (
              <button
                data-testid={`overview-select-${item.id}`}
                onClick={() =>
                  onToggleSelection?.(item.id, !selectedMediaIds?.has(item.id))
                }
              >
                Select
              </button>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  ),
}))

const buildMediaServerTypeResult = (
  mediaServerType: MediaServerType,
): ReturnType<typeof useMediaServerType> => ({
  mediaServerType,
  isLoading: false,
  isPlex: mediaServerType === MediaServerType.PLEX,
  isJellyfin: mediaServerType === MediaServerType.JELLYFIN,
  isEmby: mediaServerType === MediaServerType.EMBY,
  isMediaServerTypeSelected: true,
  isSetupComplete: true,
  isNotConfigured: false,
})

describe('Overview', () => {
  const getApiHandlerMock = vi.mocked(GetApiHandler)
  const useMediaServerTypeMock = vi.mocked(useMediaServerType)
  let libraries: MediaLibrary[] | undefined

  beforeEach(() => {
    libraries = undefined
    getApiHandlerMock.mockReset()
    submittedOutcome = {
      action: 'exclusion-add',
      succeededIds: [],
      failedIds: [],
    }
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
    useMediaServerTypeMock.mockReturnValue(
      buildMediaServerTypeResult(MediaServerType.PLEX),
    )

    getApiHandlerMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/media-server/overview/bootstrap?')) {
        return {
          libraries: libraries ?? [],
          selectedLibraryId: libraries?.[0]?.id,
          content: {
            totalSize: 0,
            items: [],
          },
        }
      }

      if (path.startsWith('/media-server/library/')) {
        return {
          totalSize: 0,
          items: [],
        }
      }

      throw new Error(`Unexpected API request: ${path}`)
    })
  })

  it('shows title ascending as the default overview option', () => {
    const sortConfig = getMediaLibrarySortConfig('show')

    expect(sortConfig.options[0]?.label).toBe('Title (A-Z) Ascending')
    expect(sortConfig.options[0]?.value).toBe('title.asc')
    expect(sortConfig.options[0]?.sortParams).toEqual({
      sort: 'title',
      sortOrder: 'asc',
    })

    expect(sortConfig.options.at(-2)).toEqual({
      value: 'manual.desc',
      label: 'Manual Added First',
      sortParams: {
        sort: 'manual',
        sortOrder: 'desc',
      },
    })

    expect(sortConfig.options.at(-1)).toEqual({
      value: 'excluded.desc',
      label: 'Excluded First',
      sortParams: {
        sort: 'excluded',
        sortOrder: 'desc',
      },
    })
  })

  it('adds studio sorting only for a media server with native support', () => {
    expect(
      getMediaLibrarySortConfig('show').options.some(
        (option) => option.value === 'studio.asc',
      ),
    ).toBe(false)
    expect(
      getMediaLibrarySortConfig('show', true).options.some(
        (option) => option.value === 'studio.asc',
      ),
    ).toBe(true)
    expect(
      getCollectionMediaSortConfig('show').options.some(
        (option) => option.value === 'studio.asc',
      ),
    ).toBe(false)
    expect(
      getCollectionMediaSortConfig('show', false, true).options.some(
        (option) => option.value === 'studio.asc',
      ),
    ).toBe(true)
  })

  it('shows studio sorting when Jellyfin is configured', async () => {
    useMediaServerTypeMock.mockReturnValue(
      buildMediaServerTypeResult(MediaServerType.JELLYFIN),
    )

    render(
      <SearchContextProvider>
        <Overview />
      </SearchContextProvider>,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: 'Studio (A-Z) Ascending' }),
      ).toBeTruthy()
    })
  })

  it('keeps failed bulk exclusions selected and reports the partial result', async () => {
    libraries = [
      {
        id: 'movies-library',
        title: 'Movies',
        type: 'movie',
      } as MediaLibrary,
    ]
    getApiHandlerMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/media-server/overview/bootstrap?')) {
        return {
          libraries,
          selectedLibraryId: 'movies-library',
          content: {
            totalSize: 2,
            items: [
              { id: 'item-1', title: 'Item One', type: 'movie' },
              { id: 'item-2', title: 'Item Two', type: 'movie' },
            ],
          },
        }
      }
      throw new Error(`Unexpected API request: ${path}`)
    })
    submittedOutcome = {
      action: 'exclusion-add',
      succeededIds: ['item-1'],
      failedIds: ['item-2'],
    }

    render(
      <SearchContextProvider>
        <Overview />
      </SearchContextProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Item One')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Select items' }))
    fireEvent.click(screen.getByTestId('overview-select-item-1'))
    fireEvent.click(screen.getByTestId('overview-select-item-2'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Add/Exclude selected (2)' }),
    )
    fireEvent.click(screen.getByTestId('media-action-submit'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        '1 item excluded everywhere. 1 item could not be excluded everywhere; the failed items stay selected.',
      )
    })
    expect(
      screen.getByRole('button', { name: 'Add/Exclude selected (1)' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Done selecting' })).toBeTruthy()
  })

  it('closes selection mode once a bulk exclusion leaves nothing selected', async () => {
    libraries = [
      { id: 'movies-library', title: 'Movies', type: 'movie' } as MediaLibrary,
    ]
    getApiHandlerMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/media-server/overview/bootstrap?')) {
        return {
          libraries,
          selectedLibraryId: 'movies-library',
          content: {
            totalSize: 1,
            items: [{ id: 'item-1', title: 'Item One', type: 'movie' }],
          },
        }
      }
      throw new Error(`Unexpected API request: ${path}`)
    })
    submittedOutcome = {
      action: 'exclusion-add',
      succeededIds: ['item-1'],
      failedIds: [],
    }

    render(
      <SearchContextProvider>
        <Overview />
      </SearchContextProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Item One')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Select items' }))
    fireEvent.click(screen.getByTestId('overview-select-item-1'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Add/Exclude selected (1)' }),
    )
    fireEvent.click(screen.getByTestId('media-action-submit'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Select items' })).toBeTruthy()
    })
    expect(screen.queryByTestId('overview-select-item-1')).toBeNull()
  })

  it('reconciles visible child cards when their show is bulk excluded', async () => {
    libraries = [
      {
        id: 'shows-library',
        title: 'Shows',
        type: 'show',
      } as MediaLibrary,
    ]
    getApiHandlerMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/media-server/overview/bootstrap?')) {
        return {
          libraries,
          selectedLibraryId: 'shows-library',
          content: {
            totalSize: 2,
            items: [
              { id: 'show-1', title: 'Sample Show', type: 'show' },
              {
                id: 'episode-1',
                title: 'Sample Episode',
                type: 'episode',
                grandparentId: 'show-1',
              },
            ],
          },
        }
      }
      throw new Error(`Unexpected API request: ${path}`)
    })
    submittedOutcome = {
      action: 'exclusion-add',
      succeededIds: ['show-1'],
      failedIds: [],
    }

    render(
      <SearchContextProvider>
        <Overview />
      </SearchContextProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Sample Show')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Select items' }))
    fireEvent.click(screen.getByTestId('overview-select-show-1'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Add/Exclude selected (1)' }),
    )
    fireEvent.click(screen.getByTestId('media-action-submit'))

    // the cascade covers the visible episode even though only the show id
    // was submitted
    await waitFor(() => {
      expect(
        screen.getByTestId('overview-exclusion-episode-1').textContent,
      ).toBe('global')
    })
    expect(screen.getByTestId('overview-exclusion-show-1').textContent).toBe(
      'global',
    )
  })

  it('clears selection and exits multi-select mode when done selecting', async () => {
    libraries = [
      {
        id: 'movies-library',
        title: 'Movies',
        type: 'movie',
      } as MediaLibrary,
    ]
    getApiHandlerMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/media-server/overview/bootstrap?')) {
        return {
          libraries,
          selectedLibraryId: 'movies-library',
          content: {
            totalSize: 1,
            items: [{ id: 'item-1', title: 'Item One', type: 'movie' }],
          },
        }
      }
      throw new Error(`Unexpected API request: ${path}`)
    })

    render(
      <SearchContextProvider>
        <Overview />
      </SearchContextProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Item One')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Select items' }))
    fireEvent.click(screen.getByTestId('overview-select-item-1'))
    expect(
      screen
        .getByRole('button', { name: 'Add/Exclude selected (1)' })
        .hasAttribute('disabled'),
    ).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Done selecting' }))

    expect(screen.getByRole('button', { name: 'Select items' })).toBeTruthy()
    expect(screen.queryByTestId('overview-select-item-1')).toBeNull()
    expect(
      screen
        .getByRole('button', { name: 'Add/Exclude selected' })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('bootstraps overview data in a single request before rendering the first page', async () => {
    libraries = [
      {
        id: 'shows-library',
        title: 'Shows',
        type: 'show',
      } as MediaLibrary,
    ]

    getApiHandlerMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/media-server/overview/bootstrap?')) {
        return {
          libraries,
          selectedLibraryId: 'shows-library',
          content: {
            totalSize: 1,
            items: [{ id: 'boot-item', title: 'Boot Item', type: 'show' }],
          },
        }
      }

      throw new Error(`Unexpected API request: ${path}`)
    })

    render(
      <SearchContextProvider>
        <Overview />
      </SearchContextProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Boot Item')).toBeTruthy()
    })

    expect(getApiHandlerMock).toHaveBeenCalledTimes(1)
    expect(getApiHandlerMock).toHaveBeenCalledWith(
      expect.stringContaining('/media-server/overview/bootstrap?'),
    )
  })

  it('requests the second page after bootstrap when loading more overview items', async () => {
    libraries = [
      {
        id: 'shows-library',
        title: 'Shows',
        type: 'show',
      } as MediaLibrary,
    ]

    getApiHandlerMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/media-server/overview/bootstrap?')) {
        return {
          libraries,
          selectedLibraryId: 'shows-library',
          content: {
            totalSize: 31,
            items: Array.from({ length: 30 }, (_, index) => ({
              id: `boot-${index + 1}`,
              title: `Boot Item ${index + 1}`,
              type: 'show',
            })),
          },
        }
      }

      if (path.startsWith('/media-server/library/shows-library/content?')) {
        expect(path).toContain('page=2')

        return {
          totalSize: 31,
          items: [{ id: 'tail-item', title: 'Tail Item', type: 'show' }],
        }
      }

      throw new Error(`Unexpected API request: ${path}`)
    })

    render(
      <SearchContextProvider>
        <Overview />
      </SearchContextProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Boot Item 1')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('overview-fetch-more'))

    await waitFor(() => {
      expect(getApiHandlerMock).toHaveBeenCalledTimes(2)
    })

    expect(getApiHandlerMock.mock.calls[1]?.[0]).toContain('page=2')

    await waitFor(() => {
      expect(screen.getByText('Tail Item')).toBeTruthy()
    })
  })

  it('exits the bootstrap spinner when no overview libraries are available', async () => {
    render(
      <SearchContextProvider>
        <Overview />
      </SearchContextProvider>,
    )

    await waitFor(() => {
      expect(getApiHandlerMock).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.queryByTestId('overview-bootstrap-spinner')).toBeNull()
    })
  })

  it('exposes both delete soonest and delete latest collection sort options', () => {
    const sortConfig = getCollectionMediaSortConfig('show', true)
    const deleteSoonestOptions = sortConfig.options.filter(
      (option) => option.sortParams?.sort === 'deleteSoonest',
    )

    expect(sortConfig.defaultValue).toBe('deleteSoonest.asc')
    expect(sortConfig.options[0]?.value).toBe('deleteSoonest.asc')
    expect(sortConfig.options[1]?.value).toBe('deleteSoonest.desc')
    expect(deleteSoonestOptions).toHaveLength(2)
    expect(deleteSoonestOptions[0]?.sortParams).toEqual({
      sort: 'deleteSoonest',
      sortOrder: 'asc',
    })
    expect(deleteSoonestOptions[1]?.sortParams).toEqual({
      sort: 'deleteSoonest',
      sortOrder: 'desc',
    })
    // The empty-string "no sort" fallback should not appear alongside the
    // explicit Delete Soonest/Latest options.
    expect(sortConfig.options.some((option) => option.value === '')).toBe(false)
  })

  it('keeps the selected library type in the query even without explicit sort params', () => {
    const url = new URL(
      `/media-server/library/shows-library/content?${buildLibraryContentQuery({
        page: 1,
        limit: 30,
        libraryType: 'show',
      })}`,
      'http://localhost',
    )

    expect(url.searchParams.get('type')).toBe('show')
    expect(url.searchParams.get('sort')).toBeNull()
    expect(url.searchParams.get('sortOrder')).toBeNull()
  })

  it('includes the selected show library type in content requests', () => {
    const url = new URL(
      `/media-server/library/shows-library/content?${buildLibraryContentQuery({
        page: 1,
        limit: 30,
        libraryType: 'show',
        sortParams: { sort: 'title', sortOrder: 'asc' },
      })}`,
      'http://localhost',
    )

    expect(url.searchParams.get('type')).toBe('show')
    expect(url.searchParams.get('sort')).toBe('title')
    expect(url.searchParams.get('sortOrder')).toBe('asc')
  })

  it('does not refetch overview content when libraries revalidate with the same first id', async () => {
    libraries = [
      {
        id: 'movies-library',
        title: 'Movies',
        type: 'movie',
      } as MediaLibrary,
    ]

    const { rerender } = render(
      <SearchContextProvider>
        <Overview />
      </SearchContextProvider>,
    )

    await waitFor(() => {
      expect(getApiHandlerMock).toHaveBeenCalledTimes(1)
    })

    libraries = [
      {
        id: 'movies-library',
        title: 'Movies',
        type: 'movie',
      } as MediaLibrary,
    ]

    rerender(
      <SearchContextProvider>
        <Overview />
      </SearchContextProvider>,
    )

    await waitFor(() => {
      expect(getApiHandlerMock).toHaveBeenCalledTimes(1)
    })
  })

  it('refetches overview content with explicit title ascending params when switching back', async () => {
    libraries = [
      {
        id: 'shows-library',
        title: 'Shows',
        type: 'show',
      } as MediaLibrary,
    ]

    render(
      <SearchContextProvider>
        <Overview />
      </SearchContextProvider>,
    )

    await waitFor(() => {
      expect(getApiHandlerMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.change(screen.getByLabelText('Sort overview items'), {
      target: { value: 'title.desc' },
    })

    await waitFor(() => {
      expect(getApiHandlerMock).toHaveBeenCalledTimes(2)
    })

    expect(getApiHandlerMock.mock.calls[1]?.[0]).toContain(
      'sort=title&sortOrder=desc',
    )

    fireEvent.change(screen.getByLabelText('Sort overview items'), {
      target: { value: 'title.asc' },
    })

    await waitFor(() => {
      expect(getApiHandlerMock).toHaveBeenCalledTimes(3)
    })

    expect(getApiHandlerMock.mock.calls[2]?.[0]).toContain(
      'sort=title&sortOrder=asc',
    )
  })

  it('clears selected items when changing the overview sort', async () => {
    libraries = [
      {
        id: 'shows-library',
        title: 'Shows',
        type: 'show',
      } as MediaLibrary,
    ]
    getApiHandlerMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/media-server/overview/bootstrap?')) {
        return {
          libraries,
          selectedLibraryId: 'shows-library',
          content: {
            totalSize: 1,
            items: [{ id: 'item-1', title: 'Item One', type: 'show' }],
          },
        }
      }
      if (path.startsWith('/media-server/library/shows-library/content?')) {
        return {
          totalSize: 1,
          items: [{ id: 'item-2', title: 'Item Two', type: 'show' }],
        }
      }
      throw new Error(`Unexpected API request: ${path}`)
    })

    render(
      <SearchContextProvider>
        <Overview />
      </SearchContextProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Item One')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Select items' }))
    fireEvent.click(screen.getByTestId('overview-select-item-1'))
    expect(
      screen
        .getByRole('button', { name: 'Add/Exclude selected (1)' })
        .hasAttribute('disabled'),
    ).toBe(false)

    fireEvent.change(screen.getByLabelText('Sort overview items'), {
      target: { value: 'title.desc' },
    })

    await waitFor(() => {
      expect(screen.getByText('Item Two')).toBeTruthy()
    })
    expect(
      screen
        .getByRole('button', { name: 'Add/Exclude selected' })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('keeps existing overview items visible while a refreshed request is in flight', async () => {
    libraries = [
      {
        id: 'shows-library',
        title: 'Shows',
        type: 'show',
      } as MediaLibrary,
    ]

    let resolveSecondRequest:
      ((value: { totalSize: number; items: any[] }) => void) | undefined

    getApiHandlerMock.mockImplementation((path: string) => {
      if (path.startsWith('/media-server/overview/bootstrap?')) {
        return Promise.resolve({
          libraries,
          selectedLibraryId: 'shows-library',
          content: {
            totalSize: 1,
            items: [
              { id: 'existing-item', title: 'Existing Item', type: 'show' },
            ],
          },
        })
      }

      if (!path.startsWith('/media-server/library/')) {
        return Promise.reject(new Error(`Unexpected API request: ${path}`))
      }

      if (path.includes('sort=title&sortOrder=desc')) {
        return new Promise((resolve) => {
          resolveSecondRequest = resolve
        })
      }

      return Promise.reject(new Error(`Unexpected API request: ${path}`))
    })

    render(
      <SearchContextProvider>
        <Overview />
      </SearchContextProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Existing Item')).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('Sort overview items'), {
      target: { value: 'title.desc' },
    })

    await waitFor(() => {
      expect(getApiHandlerMock).toHaveBeenCalledTimes(2)
    })

    expect(screen.getByText('Existing Item')).toBeTruthy()
    expect(screen.getByTestId('overview-refresh-spinner')).toBeTruthy()
    expect(screen.getByTestId('overview-content-loading')).toBeTruthy()

    resolveSecondRequest?.({
      totalSize: 1,
      items: [{ id: 'next-item', title: 'Next Item', type: 'show' }],
    })

    await waitFor(() => {
      expect(screen.getByText('Next Item')).toBeTruthy()
    })
  })

  it('preserves the loaded page count when refreshing sorted overview content', async () => {
    libraries = [
      {
        id: 'shows-library',
        title: 'Shows',
        type: 'show',
      } as MediaLibrary,
    ]

    getApiHandlerMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/media-server/overview/bootstrap?')) {
        return {
          libraries,
          selectedLibraryId: 'shows-library',
          content: {
            totalSize: 91,
            items: Array.from({ length: 30 }, (_, index) => ({
              id: `boot-${index + 1}`,
              title: `Boot Item ${index + 1}`,
              type: 'show',
            })),
          },
        }
      }

      if (
        path.includes('sort=title&sortOrder=desc') &&
        path.startsWith('/media-server/library/shows-library/content?')
      ) {
        if (path.includes('page=1')) {
          expect(path).toContain('limit=60')

          return {
            totalSize: 91,
            items: Array.from({ length: 60 }, (_, index) => ({
              id: `sorted-${index + 1}`,
              title: `Sorted Item ${index + 1}`,
              type: 'show',
            })),
          }
        }

        expect(path).toContain('page=3')
        expect(path).toContain('limit=30')

        return {
          totalSize: 91,
          items: [{ id: 'sorted-tail', title: 'Sorted Tail', type: 'show' }],
        }
      }

      if (path.startsWith('/media-server/library/shows-library/content?')) {
        expect(path).toContain('page=2')

        return {
          totalSize: 91,
          items: Array.from({ length: 30 }, (_, index) => ({
            id: `page-2-${index + 1}`,
            title: `Page 2 Item ${index + 1}`,
            type: 'show',
          })),
        }
      }

      throw new Error(`Unexpected API request: ${path}`)
    })

    render(
      <SearchContextProvider>
        <Overview />
      </SearchContextProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Boot Item 1')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('overview-fetch-more'))

    await waitFor(() => {
      expect(screen.getByText('Page 2 Item 1')).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('Sort overview items'), {
      target: { value: 'title.desc' },
    })

    await waitFor(() => {
      expect(getApiHandlerMock).toHaveBeenCalledTimes(3)
    })

    expect(getApiHandlerMock.mock.calls[2]?.[0]).toContain('page=1')
    expect(getApiHandlerMock.mock.calls[2]?.[0]).toContain('limit=60')
    expect(getApiHandlerMock.mock.calls[2]?.[0]).toContain(
      'sort=title&sortOrder=desc',
    )

    await waitFor(() => {
      expect(screen.getByText('Sorted Item 60')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('overview-fetch-more'))

    await waitFor(() => {
      expect(getApiHandlerMock).toHaveBeenCalledTimes(4)
    })

    expect(getApiHandlerMock.mock.calls[3]?.[0]).toContain('page=3')
    expect(getApiHandlerMock.mock.calls[3]?.[0]).toContain('limit=30')

    await waitFor(() => {
      expect(screen.getByText('Sorted Tail')).toBeTruthy()
    })
  })

  it('requests excluded sorting from the server for the overview sort option', async () => {
    libraries = [
      {
        id: 'shows-library',
        title: 'Shows',
        type: 'show',
      } as MediaLibrary,
    ]

    getApiHandlerMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/media-server/overview/bootstrap?')) {
        return {
          libraries,
          selectedLibraryId: 'shows-library',
          content: {
            totalSize: 1,
            items: [{ id: 'boot-item', title: 'Boot Item', type: 'show' }],
          },
        }
      }

      if (!path.startsWith('/media-server/library/shows-library/content?')) {
        throw new Error(`Unexpected API request: ${path}`)
      }

      return {
        totalSize: 3,
        items: [
          {
            id: '2',
            title: 'Bravo',
            type: 'show',
            maintainerrExclusionId: 42,
          },
          {
            id: '3',
            title: 'Charlie',
            type: 'show',
            maintainerrExclusionId: 84,
          },
          { id: '1', title: 'Alpha', type: 'show' },
        ],
      }
    })

    render(
      <SearchContextProvider>
        <Overview />
      </SearchContextProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Boot Item')).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('Sort overview items'), {
      target: { value: 'excluded.desc' },
    })

    await waitFor(() => {
      expect(getApiHandlerMock).toHaveBeenCalledTimes(2)
    })

    expect(getApiHandlerMock.mock.calls[1]?.[0]).toContain(
      'sort=excluded&sortOrder=desc',
    )

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeTruthy()
      expect(screen.getByText('Bravo')).toBeTruthy()
      expect(screen.getByText('Charlie')).toBeTruthy()
    })

    const contentText = screen.getByTestId('overview-items').textContent ?? ''

    expect(contentText).toContain('Bravo')
    expect(contentText.indexOf('Bravo')).toBeLessThan(
      contentText.indexOf('Alpha'),
    )
    expect(contentText.indexOf('Charlie')).toBeLessThan(
      contentText.indexOf('Alpha'),
    )
  })
})
