import type { MediaLibrary } from '@maintainerr/contracts'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchContextProvider } from '../../contexts/search-context'
import GetApiHandler from '../../utils/ApiHandler'
import {
  getCollectionMediaSortConfig,
  getMediaLibrarySortConfig,
} from '../Common/MediaLibrarySortControl'
import Overview, { buildLibraryContentQuery } from './index'

vi.mock('../../utils/ApiHandler', () => ({
  default: vi.fn(),
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
    loading,
  }: {
    data: Array<{ id: string; title: string }>
    loading: boolean
  }) => (
    <div>
      {loading ? <span data-testid="overview-content-loading" /> : null}
      {data.map((item) => (
        <span key={item.id}>{item.title}</span>
      ))}
    </div>
  ),
}))

describe('Overview', () => {
  const getApiHandlerMock = vi.mocked(GetApiHandler)
  let libraries: MediaLibrary[] | undefined

  beforeEach(() => {
    libraries = undefined
    getApiHandlerMock.mockReset()

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

  afterEach(() => {
    cleanup()
  })

  it('shows title ascending as the default overview option', () => {
    const sortConfig = getMediaLibrarySortConfig('show')

    expect(sortConfig.options[0]?.label).toBe('Title (A-Z) Ascending')
    expect(sortConfig.options[0]?.value).toBe('title.asc')
    expect(sortConfig.options[0]?.sortParams).toEqual({
      sort: 'title',
      sortOrder: 'asc',
    })
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

  it('only exposes the reachable delete soonest collection sort option', () => {
    const sortConfig = getCollectionMediaSortConfig('show', true)
    const deleteSoonestOptions = sortConfig.options.filter(
      (option) => option.sortParams?.sort === 'deleteSoonest',
    )

    expect(sortConfig.defaultValue).toBe('deleteSoonest.asc')
    expect(sortConfig.options[0]?.value).toBe('deleteSoonest.asc')
    expect(
      sortConfig.options.some((option) => option.value === 'deleteSoonest.asc'),
    ).toBe(true)
    expect(deleteSoonestOptions).toHaveLength(1)
    expect(deleteSoonestOptions[0]?.sortParams).toEqual({
      sort: 'deleteSoonest',
      sortOrder: 'asc',
    })
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

  it('keeps existing overview items visible while a refreshed request is in flight', async () => {
    libraries = [
      {
        id: 'shows-library',
        title: 'Shows',
        type: 'show',
      } as MediaLibrary,
    ]

    let resolveSecondRequest:
      | ((value: { totalSize: number; items: any[] }) => void)
      | undefined

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
})
