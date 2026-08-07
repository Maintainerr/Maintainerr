import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'react-toastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMediaServerType } from '../../../../hooks/useMediaServerType'
import GetApiHandler from '../../../../utils/ApiHandler'
import type { ICollection } from '../..'
import type { MediaActionOutcome } from '../../../Common/MediaActionModal'
import CollectionExclusions from './index'

vi.mock('../../../../utils/ApiHandler', () => ({
  default: vi.fn(),
}))

// The shared modal has its own spec; this only hands back an outcome.
let submittedOutcome: MediaActionOutcome = {
  action: 'exclusion-remove',
  succeededIds: [],
  failedIds: [],
}

vi.mock('../../../Common/MediaActionModal', () => ({
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

vi.mock('../../../../hooks/useMediaServerType', () => ({
  useMediaServerType: vi.fn(),
}))

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('../../../Overview/Content', () => ({
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
    <div data-testid="exclusion-items">
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

const collection = {
  id: 42,
  libraryId: 'library-1',
  title: 'Test Collection',
  type: 'movie',
} as ICollection

const buildExclusion = (
  id: number,
  mediaServerId: string,
  ruleGroupId: number | null,
) => ({
  id,
  mediaServerId,
  ruleGroupId,
  parent: 0,
  type: 0,
  mediaData: {
    id: mediaServerId,
    title: `Item ${mediaServerId}`,
    type: 'movie' as const,
    guid: `guid-${mediaServerId}`,
    addedAt: new Date('2026-04-20T00:00:00.000Z'),
    providerIds: {},
    mediaSources: [],
    library: { id: 'library-1', title: 'Test Library' },
  },
})

describe('CollectionExclusions bulk removal', () => {
  const getApiHandlerMock = vi.mocked(GetApiHandler)

  beforeEach(() => {
    getApiHandlerMock.mockReset()
    submittedOutcome = {
      action: 'exclusion-remove',
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
        ? [
            buildExclusion(11, 'movie-1', 5),
            buildExclusion(12, 'movie-2', null),
          ]
        : [],
    }))
  })

  const renderAndSelect = async (mediaServerIds: string[]) => {
    render(<CollectionExclusions collection={collection} />)

    await waitFor(() => expect(screen.getByText('Item movie-1')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Select items' }))
    for (const mediaServerId of mediaServerIds) {
      fireEvent.click(screen.getByTestId(`select-${mediaServerId}`))
    }
    fireEvent.click(
      screen.getByRole('button', {
        name: `Add/Exclude selected (${mediaServerIds.length})`,
      }),
    )
  }

  it('drops the cards whose exclusion was removed', async () => {
    submittedOutcome = {
      action: 'exclusion-remove',
      succeededIds: ['movie-1'],
      failedIds: [],
    }

    await renderAndSelect(['movie-1'])
    fireEvent.click(screen.getByTestId('media-action-submit'))

    await waitFor(() => expect(screen.queryByText('Item movie-1')).toBeNull())
    expect(screen.getByText('Item movie-2')).toBeTruthy()
    expect(toast.success).toHaveBeenCalledWith('1 item un-excluded.')
    expect(screen.getByRole('button', { name: 'Select items' })).toBeTruthy()
  })

  it('keeps the cards an action left excluded', async () => {
    submittedOutcome = {
      action: 'collection-add',
      succeededIds: ['movie-1'],
      failedIds: [],
    }

    await renderAndSelect(['movie-1'])
    fireEvent.click(screen.getByTestId('media-action-submit'))

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('1 item added.'),
    )
    expect(screen.getByText('Item movie-1')).toBeTruthy()
  })

  it('keeps a failed removal on screen and selected', async () => {
    submittedOutcome = {
      action: 'exclusion-remove',
      succeededIds: ['movie-1'],
      failedIds: ['movie-2'],
    }

    await renderAndSelect(['movie-1', 'movie-2'])
    fireEvent.click(screen.getByTestId('media-action-submit'))

    await waitFor(() => expect(screen.queryByText('Item movie-1')).toBeNull())
    expect(screen.getByText('Item movie-2')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Add/Exclude selected (1)' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Done selecting' })).toBeTruthy()
    expect(toast.error).toHaveBeenCalledWith(
      '1 item un-excluded. 1 item could not be un-excluded; the failed items stay selected.',
    )
  })
})
