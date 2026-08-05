import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'react-toastify'
import type { ICollection } from '../components/Collection'
import type { MediaActionOutcome } from '../components/Common/MediaActionModal'
import { useMediaServerType } from '../hooks/useMediaServerType'
import GetApiHandler from '../utils/ApiHandler'
import CollectionMediaPage, {
  mapCollectionMediaItemsToMediaData,
} from './CollectionMediaPage'

const outletContext = {
  collection: {
    id: 42,
    libraryId: 'library-1',
    title: 'Test Collection',
    type: 'movie',
  } as ICollection,
  canTestMedia: true,
  openMediaTestModal: vi.fn(),
}

vi.mock('../utils/ApiHandler', () => ({
  default: vi.fn(),
}))

// The shared modal has its own spec; this only hands back an outcome.
let submittedOutcome: MediaActionOutcome = {
  action: 'exclusion-add',
  succeededIds: [],
  failedIds: [],
}

vi.mock('../components/Common/MediaActionModal', () => ({
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

vi.mock('../hooks/useMediaServerType', () => ({
  useMediaServerType: vi.fn(),
}))

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('react-router-dom', () => ({
  useOutletContext: () => outletContext,
  useParams: () => ({ id: '42' }),
}))

vi.mock('../components/Overview/Content', () => ({
  default: ({
    data,
    selectionMode,
    selectedMediaIds,
    onToggleSelection,
  }: {
    data: Array<{ id: string; title: string }>
    selectionMode?: boolean
    selectedMediaIds?: ReadonlySet<string>
    onToggleSelection?: (mediaId: string, selected: boolean) => void
  }) => (
    <div data-testid="collection-media-items">
      {data.map((item) => (
        <span key={item.id}>
          {item.title}
          {selectionMode ? (
            <button
              data-testid={`select-${item.id}`}
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
  ),
}))

const buildMediaItem = (id: string) => ({
  id,
  collectionId: 42,
  mediaServerId: id,
  addDate: new Date('2026-04-20T00:00:00.000Z'),
  isManual: false,
  collection: {} as never,
  mediaData: {
    id,
    title: `Item ${id}`,
    type: 'movie' as const,
    guid: `guid-${id}`,
    addedAt: new Date('2026-04-20T00:00:00.000Z'),
    providerIds: {},
    mediaSources: [],
    library: { id: 'library-1', title: 'Test Library' },
  },
})

describe('CollectionMediaPage', () => {
  it('maps manual state without mutating the original media data objects', () => {
    const sharedMediaData = {
      id: 'episode-1',
      title: 'Episode 1',
      type: 'episode' as const,
      guid: 'test-guid-1',
      addedAt: new Date('2026-04-20T00:00:00.000Z'),
      providerIds: {},
      mediaSources: [],
      library: { id: 'lib-1', title: 'Test Library' },
      maintainerrIsManual: false,
    }

    const result = mapCollectionMediaItemsToMediaData([
      {
        id: 1,
        collectionId: 7,
        mediaServerId: 'episode-1',
        addDate: new Date('2026-04-20T00:00:00.000Z'),
        isManual: true,
        collection: {} as never,
        mediaData: sharedMediaData,
      },
      {
        id: 2,
        collectionId: 7,
        mediaServerId: 'episode-2',
        addDate: new Date('2026-04-20T00:00:00.000Z'),
        isManual: false,
        collection: {} as never,
        mediaData: sharedMediaData,
      },
    ])

    expect(result[0].maintainerrIsManual).toBe(true)
    expect(result[1].maintainerrIsManual).toBe(false)
    expect(sharedMediaData.maintainerrIsManual).toBe(false)
    expect(result[0]).not.toBe(sharedMediaData)
    expect(result[1]).not.toBe(sharedMediaData)
  })

  describe('bulk exclusion', () => {
    const getApiHandlerMock = vi.mocked(GetApiHandler)

    beforeEach(() => {
      getApiHandlerMock.mockReset()
      submittedOutcome = {
        action: 'exclusion-add',
        succeededIds: [],
        failedIds: [],
      }
      vi.mocked(toast.success).mockReset()
      vi.mocked(toast.error).mockReset()
      vi.mocked(useMediaServerType).mockReturnValue({
        mediaServerType: undefined,
      } as unknown as ReturnType<typeof useMediaServerType>)
      // The paginated list probes one page past the last, so only page 1
      // carries items.
      getApiHandlerMock.mockImplementation(async (path: string) => ({
        totalSize: 2,
        items: path.includes('/content/1?')
          ? [buildMediaItem('movie-1'), buildMediaItem('movie-2')]
          : [],
      }))
    })

    const selectAndSubmit = async (ids: string[]) => {
      render(<CollectionMediaPage />)

      await waitFor(() => expect(screen.getByText('Item movie-1')).toBeTruthy())

      fireEvent.click(screen.getByRole('button', { name: 'Select items' }))
      for (const id of ids) {
        fireEvent.click(screen.getByTestId(`select-${id}`))
      }
      fireEvent.click(
        screen.getByRole('button', {
          name: `Add/Exclude selected (${ids.length})`,
        }),
      )
      fireEvent.click(screen.getByTestId('media-action-submit'))
    }

    it('drops the cards an exclusion took out of the collection', async () => {
      submittedOutcome = {
        action: 'exclusion-add',
        succeededIds: ['movie-1'],
        failedIds: [],
      }

      await selectAndSubmit(['movie-1'])

      await waitFor(() => expect(screen.queryByText('Item movie-1')).toBeNull())
      expect(screen.getByText('Item movie-2')).toBeTruthy()
      expect(toast.success).toHaveBeenCalledWith('1 item excluded.')
      expect(screen.getByRole('button', { name: 'Select items' })).toBeTruthy()
    })

    // The item leaves this collection, and the grid holds its own state, so
    // nothing refetches it away.
    it('drops the cards a remove-from-all-collections took out', async () => {
      submittedOutcome = {
        action: 'collection-remove-all',
        succeededIds: ['movie-1'],
        failedIds: [],
      }

      await selectAndSubmit(['movie-1'])

      await waitFor(() => expect(screen.queryByText('Item movie-1')).toBeNull())
      expect(screen.getByText('Item movie-2')).toBeTruthy()
    })

    it('keeps the cards an action left in the collection', async () => {
      submittedOutcome = {
        action: 'exclusion-remove',
        succeededIds: ['movie-1'],
        failedIds: [],
      }

      await selectAndSubmit(['movie-1'])

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('1 item un-excluded.'),
      )
      expect(screen.getByText('Item movie-1')).toBeTruthy()
    })

    it('keeps a failed item on screen and selected', async () => {
      submittedOutcome = {
        action: 'exclusion-add',
        succeededIds: ['movie-1'],
        failedIds: ['movie-2'],
      }

      await selectAndSubmit(['movie-1', 'movie-2'])

      await waitFor(() => expect(screen.queryByText('Item movie-1')).toBeNull())
      expect(screen.getByText('Item movie-2')).toBeTruthy()
      expect(
        screen.getByRole('button', { name: 'Add/Exclude selected (1)' }),
      ).toBeTruthy()
      expect(
        screen.getByRole('button', { name: 'Done selecting' }),
      ).toBeTruthy()
      expect(toast.error).toHaveBeenCalledWith(
        '1 item excluded. 1 item could not be excluded; the failed items stay selected.',
      )
    })
  })
})
