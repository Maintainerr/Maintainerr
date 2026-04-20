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
import CollectionsListPage from './CollectionsListPage'

const navigate = vi.fn()
const fetchQuery = vi.fn()

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

  beforeEach(() => {
    cleanup()
    navigate.mockReset()
    fetchQuery.mockReset()
    fetchCollectionsMock.mockReset()
    useCollectionsMock.mockReset()
    useQueryClientMock.mockReturnValue({
      fetchQuery,
    } as ReturnType<typeof useQueryClient>)

    useCollectionsMock.mockReturnValue({
      data: [
        {
          id: 1,
          title: 'Action',
        },
      ],
      isLoading: false,
    } as ReturnType<typeof useCollections>)
  })

  afterEach(() => {
    cleanup()
  })

  it('restores the previous library selection if a library switch request fails', async () => {
    fetchQuery.mockRejectedValueOnce(new Error('request failed'))

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
