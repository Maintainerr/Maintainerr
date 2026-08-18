import { MediaServerType } from '@maintainerr/contracts'
import { fireEvent, render, screen, waitFor } from '../../test-utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  postBulkCollectionMedia,
  postBulkExclusions,
} from '../../api/bulkMediaAction'
import { useCollections } from '../../api/collections'
import { useMediaServerMetadataChildren } from '../../api/media-server'
import { useMediaServerType } from '../../hooks/useMediaServerType'
import type { ICollection } from '../Collection'
import {
  buildQueryErrorResult,
  buildQuerySuccessResult,
} from '../../test-utils/queryResults'
import MediaActionModal from './MediaActionModal'

vi.mock('../../api/bulkMediaAction', () => ({
  postBulkCollectionMedia: vi.fn(),
  postBulkExclusions: vi.fn(),
}))

vi.mock('../../api/collections', () => ({
  invalidateCollectionQueries: vi.fn(),
  useCollections: vi.fn(),
}))

vi.mock('../../api/media-server', () => ({
  useMediaServerMetadataChildren: vi.fn(),
}))

vi.mock('../../hooks/useMediaServerType', () => ({
  useMediaServerType: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

const buildCollection = (
  id: number,
  title: string,
  type: ICollection['type'] = 'movie',
): ICollection => ({ id, title, type }) as ICollection

const onSubmitted = vi.fn()
const onCancel = vi.fn()

const renderModal = (props: Partial<Parameters<typeof MediaActionModal>[0]>) =>
  render(
    <MediaActionModal
      mediaIds={['movie-1', 'movie-2']}
      mediaType="movie"
      libraryId="library-1"
      onCancel={onCancel}
      onSubmitted={onSubmitted}
      {...props}
    />,
  )

const selectAction = (value: string) =>
  fireEvent.change(screen.getByLabelText('Action'), { target: { value } })

describe('MediaActionModal', () => {
  const useCollectionsMock = vi.mocked(useCollections)
  const useChildrenMock = vi.mocked(useMediaServerMetadataChildren)
  const useMediaServerTypeMock = vi.mocked(useMediaServerType)
  const postExclusionsMock = vi.mocked(postBulkExclusions)
  const postCollectionMock = vi.mocked(postBulkCollectionMedia)

  const setMediaServerType = (mediaServerType: MediaServerType) =>
    useMediaServerTypeMock.mockReturnValue({
      mediaServerType,
    } as unknown as ReturnType<typeof useMediaServerType>)

  beforeEach(() => {
    // Bound to one library by default, which is what the picker assertions test.
    setMediaServerType(MediaServerType.PLEX)
    onSubmitted.mockReset()
    onCancel.mockReset()
    postExclusionsMock.mockReset()
    postCollectionMock.mockReset()
    postExclusionsMock.mockResolvedValue({
      results: [
        { mediaId: 'movie-1', code: 1 },
        { mediaId: 'movie-2', code: 0, message: 'Failed' },
      ],
    })
    postCollectionMock.mockResolvedValue({
      results: [{ mediaId: 'movie-1', code: 1 }],
    })
    useCollectionsMock.mockReturnValue(
      buildQuerySuccessResult([
        buildCollection(7, 'Movie collection'),
        buildCollection(9, 'Show collection', 'show'),
        buildCollection(11, 'Season collection', 'season'),
      ]) as unknown as ReturnType<typeof useCollections>,
    )
    useChildrenMock.mockReturnValue(
      buildQuerySuccessResult([]) as unknown as ReturnType<
        typeof useMediaServerMetadataChildren
      >,
    )
  })

  it('offers only the collections the selection can be applied to', () => {
    renderModal({})

    // The picker is scoped to the page's library - offering another library's
    // collections only produces a rejected add (#3383's shape).
    expect(useCollectionsMock).toHaveBeenCalledWith(
      'library-1',
      expect.objectContaining({ enabled: true }),
    )
    expect(
      screen.getByRole('option', { name: 'Movie collection' }),
    ).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Show collection' })).toBeNull()
    // an add needs a real target, so it cannot mean "every collection"
    expect(screen.queryByRole('option', { name: 'All collections' })).toBeNull()
  })

  it('offers only library-agnostic actions when no library is known', () => {
    renderModal({ libraryId: undefined })

    expect(useCollectionsMock).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ enabled: false }),
    )
    expect(
      screen.queryByRole('option', { name: 'Add to collection' }),
    ).toBeNull()
    expect(
      screen.queryByRole('option', { name: 'Remove from collection' }),
    ).toBeNull()
    expect(screen.getByRole('option', { name: 'Add exclusion' })).toBeTruthy()
    expect(screen.getByText(/spans more than one library/)).toBeTruthy()
  })

  // A search selection keeps them where any collection can take the item (#3448).
  it('keeps the collection actions without a library where collections span them', () => {
    setMediaServerType(MediaServerType.JELLYFIN)
    renderModal({ libraryId: undefined })

    expect(useCollectionsMock).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ enabled: true }),
    )
    expect(
      screen.getByRole('option', { name: 'Add to collection' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('option', { name: 'Movie collection' }),
    ).toBeTruthy()
  })

  it('adds the selection to the chosen collection and reports per-item results', async () => {
    renderModal({})

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() =>
      expect(postCollectionMock).toHaveBeenCalledWith({
        mediaIds: ['movie-1', 'movie-2'],
        collectionId: 7,
        action: 0,
        mediaType: 'movie',
      }),
    )
    expect(onSubmitted).toHaveBeenCalledWith({
      action: 'collection-add',
      collectionId: 7,
      collectionTitle: 'Movie collection',
      succeededIds: ['movie-1'],
      failedIds: [],
      failureReasons: [],
    })
  })

  it('confirms before an action that covers every collection', async () => {
    renderModal({})
    selectAction('exclusion-add')
    fireEvent.change(screen.getByLabelText('Collection'), {
      target: { value: '-1' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(screen.getByText('Confirm Global Exclusion')).toBeTruthy()
    expect(
      screen.getByText(/removed from every collection they are currently in/),
    ).toBeTruthy()
    expect(postExclusionsMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }))

    await waitFor(() =>
      expect(postExclusionsMock).toHaveBeenCalledWith({
        mediaIds: ['movie-1', 'movie-2'],
        collectionId: undefined,
        action: 0,
      }),
    )
    expect(onSubmitted).toHaveBeenCalledWith({
      action: 'exclusion-add',
      collectionId: undefined,
      // "every collection" is a scope, not a collection a badge can name
      collectionTitle: undefined,
      succeededIds: ['movie-1'],
      failedIds: ['movie-2'],
      failureReasons: ['Failed'],
    })
  })

  it('preselects the calling page collection while still offering every scope', async () => {
    renderModal({ defaultCollectionId: 7 })
    selectAction('exclusion-add')

    const collectionField = screen.getByLabelText(
      'Collection',
    ) as HTMLSelectElement
    expect(collectionField.disabled).toBe(false)
    expect(collectionField.value).toBe('7')
    expect(screen.getByRole('option', { name: 'All collections' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() =>
      expect(postExclusionsMock).toHaveBeenCalledWith({
        mediaIds: ['movie-1', 'movie-2'],
        collectionId: 7,
        action: 0,
      }),
    )
  })

  it('removes from every collection through the all-collections scope', async () => {
    renderModal({})
    selectAction('collection-remove')
    fireEvent.change(screen.getByLabelText('Collection'), {
      target: { value: '-1' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(
      screen.getByText('Confirm Removal From Every Collection'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }))

    await waitFor(() =>
      expect(postCollectionMock).toHaveBeenCalledWith({
        mediaIds: ['movie-1', 'movie-2'],
        collectionId: undefined,
        action: 1,
        mediaType: 'movie',
      }),
    )
  })

  it('drops the collection actions for a selection that mixes media types', () => {
    renderModal({ mediaType: undefined })

    expect(
      screen.queryByRole('option', { name: 'Add to collection' }),
    ).toBeNull()
    expect(screen.getByRole('option', { name: 'Add exclusion' })).toBeTruthy()
    expect(screen.getByText(/mixes media types/)).toBeTruthy()
  })

  // The show has to stay the media id: the exclusion rows record it as their
  // parent, which is what an un-exclude through the show later matches on.
  it('narrows a single show through a context, keeping the show as the item', async () => {
    useChildrenMock.mockImplementation(
      (itemId?: string) =>
        (itemId === 'show-1'
          ? buildQuerySuccessResult([{ id: 'season-1', title: 'Season 1' }])
          : buildQuerySuccessResult([])) as unknown as ReturnType<
          typeof useMediaServerMetadataChildren
        >,
    )

    renderModal({ mediaIds: ['show-1'], mediaType: 'show' })
    selectAction('exclusion-add')
    fireEvent.change(screen.getByLabelText('Seasons'), {
      target: { value: 'season-1' },
    })
    // narrowing to a season drops the show collection, leaving the ones a
    // season can actually produce
    expect(screen.queryByRole('option', { name: 'Show collection' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Collection'), {
      target: { value: '11' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() =>
      expect(postExclusionsMock).toHaveBeenCalledWith({
        mediaIds: ['show-1'],
        collectionId: 11,
        action: 0,
        context: { id: 'season-1', type: 'season' },
      }),
    )
  })

  it('does not offer season narrowing for a multi-item selection', () => {
    renderModal({ mediaIds: ['show-1', 'show-2'], mediaType: 'show' })

    expect(screen.queryByLabelText('Seasons')).toBeNull()
  })

  it('keeps the modal open and shows why when the request fails', async () => {
    postCollectionMock.mockRejectedValue(new Error('boom'))

    renderModal({})
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(screen.getByText('boom')).toBeTruthy())
    expect(onSubmitted).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy()
  })

  it('reports the reasons the server refused items', async () => {
    postCollectionMock.mockResolvedValue({
      results: [
        { mediaId: 'movie-1', code: 1 },
        {
          mediaId: 'movie-2',
          code: 0,
          message: "Failed - not in this collection's library",
        },
      ],
    })

    renderModal({})
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() =>
      expect(onSubmitted).toHaveBeenCalledWith(
        expect.objectContaining({
          failedIds: ['movie-2'],
          failureReasons: ["Failed - not in this collection's library"],
        }),
      ),
    )
  })

  it('says why the collections could not be loaded', () => {
    useCollectionsMock.mockReturnValue(
      buildQueryErrorResult(
        new Error('Plex unreachable'),
      ) as unknown as ReturnType<typeof useCollections>,
    )

    renderModal({})

    // The reason the server gave beats the generic fallback.
    expect(screen.getByText('Plex unreachable')).toBeTruthy()
  })

  it('says so, and refuses to submit, when no collection can take the selection', () => {
    useCollectionsMock.mockReturnValue(
      buildQuerySuccessResult([]) as unknown as ReturnType<
        typeof useCollections
      >,
    )

    renderModal({})

    expect(
      screen.getByText(/No collection can take this selection/),
    ).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })
})
