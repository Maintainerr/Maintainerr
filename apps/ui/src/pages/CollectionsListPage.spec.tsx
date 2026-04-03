import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CollectionsListPage from './CollectionsListPage'
import GetApiHandler from '../utils/ApiHandler'

const navigate = vi.fn()
const invalidate = vi.fn()

vi.mock('../utils/ApiHandler', () => ({
  default: vi.fn(),
  PostApiHandler: vi.fn(),
}))

vi.mock('../hooks/useRequestGeneration', () => ({
  useRequestGeneration: () => ({
    invalidate,
    guardedFetch: async (fetcher: () => Promise<unknown>) => ({
      status: 'success' as const,
      data: await fetcher(),
    }),
  }),
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
  const getApiHandlerMock = vi.mocked(GetApiHandler)

  beforeEach(() => {
    cleanup()
    navigate.mockReset()
    invalidate.mockReset()
    getApiHandlerMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('restores the previous library selection if a library switch request fails', async () => {
    getApiHandlerMock
      .mockResolvedValueOnce([
        {
          id: 1,
          title: 'Action',
        },
      ] as any)
      .mockRejectedValueOnce(new Error('request failed'))

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
  })
})
