import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useQueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCollections, useCollections } from '../api/collections'
import type { ICollection } from '../components/Collection'
import { createTestQueryClient } from '../test-utils/queryClient'
import { buildQuerySuccessResult } from '../test-utils/queryResults'
import CollectionsListPage from './CollectionsListPage'

const navigate = vi.fn()

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )

  return {
    ...actual,
    useQueryClient: vi.fn(),
  }
})

vi.mock('../api/collections', () => ({
  useCollections: vi.fn(),
  fetchCollections: vi.fn(),
}))

vi.mock('../utils/ApiHandler', () => ({
  PostApiHandler: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

vi.mock('../components/Collection/CollectionOverview', () => ({
  default: ({
    collections,
    isLoading,
    onSwitchLibrary,
    selectedLibraryId,
  }: {
    collections: Array<{ title: string }>
    isLoading: boolean
    onSwitchLibrary: (id: string) => void
    selectedLibraryId: string
  }) => (
    <div>
      <div data-testid="selected-library">{selectedLibraryId}</div>
      <div data-testid="loading-state">{`${isLoading}`}</div>
      <button type="button" onClick={() => onSwitchLibrary('library-2')}>
        Switch Library
      </button>
      {collections.map((collection) => (
        <div key={collection.title}>{collection.title}</div>
      ))}
    </div>
  ),
}))

describe('CollectionsListPage', () => {
  const useCollectionsMock = vi.mocked(useCollections)
  const fetchCollectionsMock = vi.mocked(fetchCollections)
  const useQueryClientMock = vi.mocked(useQueryClient)
  let queryClient: ReturnType<typeof createTestQueryClient>

  beforeEach(() => {
    cleanup()
    navigate.mockReset()
    fetchCollectionsMock.mockReset()
    useCollectionsMock.mockReset()
    queryClient = createTestQueryClient()
    vi.spyOn(queryClient, 'fetchQuery')
    useQueryClientMock.mockReturnValue(queryClient)

    const collection: ICollection = {
      id: 1,
      title: 'Action',
      libraryId: 'library-1',
      isActive: true,
      type: 'movie',
      arrAction: 0,
      media: [],
      manualCollection: false,
      manualCollectionName: '',
      addDate: new Date(),
      handledMediaAmount: 0,
      lastDurationInSeconds: 0,
      keepLogsForMonths: 0,
    }

    useCollectionsMock.mockReturnValue(buildQuerySuccessResult([collection]))
  })

  afterEach(() => {
    cleanup()
  })

  it('restores the previous library selection if a library switch request fails', async () => {
    vi.mocked(queryClient.fetchQuery).mockRejectedValueOnce(
      new Error('request failed'),
    )

    render(<CollectionsListPage />)

    await waitFor(() => {
      expect(screen.getByTestId('selected-library').textContent).toBe('all')
    })

    expect(screen.getByText('Action')).toBeTruthy()

    fireEvent.click(screen.getByText('Switch Library'))

    await waitFor(() => {
      expect(screen.getByTestId('selected-library').textContent).toBe('all')
    })

    expect(screen.getByText('Action')).toBeTruthy()
    expect(screen.getByTestId('loading-state').textContent).toBe('false')
    expect(fetchCollectionsMock).not.toHaveBeenCalled()
  })
})
