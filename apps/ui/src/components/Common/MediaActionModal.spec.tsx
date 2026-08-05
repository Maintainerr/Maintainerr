import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  postBulkCollectionMedia,
  postBulkExclusions,
} from '../../api/bulkMediaAction'
import { useCollections } from '../../api/collections'
import { useMediaServerMetadataChildren } from '../../api/media-server'
import type { ICollection } from '../Collection'
import { buildQuerySuccessResult } from '../../test-utils/queryResults'
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
  const postExclusionsMock = vi.mocked(postBulkExclusions)
  const postCollectionMock = vi.mocked(postBulkCollectionMedia)

  beforeEach(() => {
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

    expect(
      screen.getByRole('option', { name: 'Movie collection' }),
    ).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Show collection' })).toBeNull()
    // an add needs a real target, so it cannot mean "every collection"
    expect(screen.queryByRole('option', { name: 'All collections' })).toBeNull()
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
    })
  })

  it('confirms before an action that covers every collection', async () => {
    renderModal({})
    selectAction('exclusion-add')
    fireEvent.change(screen.getByLabelText('Collection'), {
      target: { value: '-1' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(screen.getByText('Confirmation Required')).toBeTruthy()
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
    })
  })

  it('pins the collection a collection page acts on', async () => {
    renderModal({
      lockedCollection: { id: 42, title: 'This collection' },
    })
    selectAction('exclusion-add')

    const collectionField = screen.getByLabelText(
      'Collection',
    ) as HTMLSelectElement
    expect(collectionField.disabled).toBe(true)
    expect(collectionField.options).toHaveLength(1)
    // no "every collection" scope the page could not show the result of
    expect(screen.queryByRole('option', { name: 'All collections' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() =>
      expect(postExclusionsMock).toHaveBeenCalledWith({
        mediaIds: ['movie-1', 'movie-2'],
        collectionId: 42,
        action: 0,
      }),
    )
  })

  it('removes from every collection without asking for one', async () => {
    renderModal({})
    selectAction('collection-remove-all')

    // nothing to pick: the action names every collection itself
    expect(screen.queryByLabelText('Collection')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(screen.getByText('Confirmation Required')).toBeTruthy()
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

  it('hides the actions the calling page says cannot do anything', () => {
    renderModal({
      lockedCollection: { id: 42, title: 'This collection' },
      hiddenActions: ['collection-add'],
    })

    expect(
      screen.queryByRole('option', { name: 'Add to collection' }),
    ).toBeNull()
    // and the first action still offered is what the form falls back to
    expect((screen.getByLabelText('Action') as HTMLSelectElement).value).toBe(
      'collection-remove',
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
})
