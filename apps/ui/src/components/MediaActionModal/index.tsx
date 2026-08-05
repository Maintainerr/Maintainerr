import type { MediaItemType } from '@maintainerr/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  postBulkCollectionMedia,
  postBulkExclusions,
} from '../../api/bulkMediaAction'
import {
  invalidateCollectionQueries,
  useCollections,
} from '../../api/collections'
import { useMediaServerMetadataChildren } from '../../api/media-server'
import { getApiErrorMessage } from '../../utils/ApiError'
import GetApiHandler from '../../utils/ApiHandler'
import Alert from '../Common/Alert'
import FormItem from '../Common/FormItem'
import Modal from '../Common/Modal'
import PendingButton from '../Common/PendingButton'
import {
  clearMaintainerrStatusDetailsCache,
  fetchMaintainerrStatusDetails,
} from '../Common/MediaCard/maintainerrStatus'
import { Select } from '../Forms/Select'

/** Sentinel collection id for "every collection", including a global exclusion. */
const ALL_COLLECTIONS = -1

export type MediaAction =
  | 'collection-add'
  | 'collection-remove'
  | 'collection-remove-all'
  | 'exclusion-add'
  | 'exclusion-remove'

const actionLabels: Record<MediaAction, string> = {
  'collection-add': 'Add to collection',
  'collection-remove': 'Remove from collection',
  'collection-remove-all': 'Remove from all collections',
  'exclusion-add': 'Add exclusion',
  'exclusion-remove': 'Remove exclusion',
}

const targetsEveryCollection = (action: MediaAction) =>
  action === 'collection-remove-all'

export interface MediaActionOutcome {
  action: MediaAction
  /** undefined means every collection. */
  collectionId?: number
  succeededIds: string[]
  failedIds: string[]
}

export interface MediaActionModalProps {
  mediaIds: string[]
  /** Undefined for a mixed selection, which no single collection can take. */
  mediaType?: MediaItemType
  libraryId?: string
  /** Pins the picker, so a page cannot act outside the scope it can show. */
  lockedCollection?: { id: number; title: string }
  /** Actions that cannot do anything on the calling page. */
  hiddenActions?: MediaAction[]
  onCancel: () => void
  onSubmitted: (outcome: MediaActionOutcome) => void
}

/**
 * Drives a whole selection. A single-item selection keeps the season/episode
 * narrowing and the per-item global-exclusion warning, so nothing the old
 * per-item modal could do was lost.
 */
const MediaActionModal = ({
  mediaIds,
  mediaType,
  libraryId,
  lockedCollection,
  hiddenActions,
  onCancel,
  onSubmitted,
}: MediaActionModalProps) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [pickedAction, setPickedAction] = useState<MediaAction>()
  const [selectedCollection, setSelectedCollection] = useState<number>()
  const [selectedSeasons, setSelectedSeasons] = useState<string>()
  const [selectedEpisodes, setSelectedEpisodes] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>()
  const [confirmAllCollections, setConfirmAllCollections] = useState(false)
  const [affectedExclusions, setAffectedExclusions] = useState<
    { label: string; targetPath: string }[]
  >([])

  const singleMediaId = mediaIds.length === 1 ? mediaIds[0] : undefined
  const canNarrow = singleMediaId !== undefined && mediaType === 'show'

  const seasonsQuery = useMediaServerMetadataChildren(singleMediaId, {
    enabled: canNarrow,
  })
  const episodesQuery = useMediaServerMetadataChildren(selectedSeasons)
  // A collection only accepts items from its own library, so offering the other
  // libraries' collections only produces a rejected add.
  const collectionsQuery = useCollections(libraryId, {
    enabled: !lockedCollection,
  })

  // Handing the narrowed id straight to the server resolves identically to
  // naming it as a context, so the request keeps one shape for every size.
  const submittedIds = useMemo(
    () =>
      selectedEpisodes
        ? [selectedEpisodes]
        : selectedSeasons
          ? [selectedSeasons]
          : mediaIds,
    [selectedSeasons, selectedEpisodes, mediaIds],
  )

  const submittedType = useMemo((): MediaItemType | undefined => {
    if (!canNarrow) return mediaType
    if (selectedEpisodes) return 'episode'
    if (selectedSeasons) return 'season'
    return mediaType
  }, [canNarrow, mediaType, selectedSeasons, selectedEpisodes])

  // A context resolves down the hierarchy but never up, so offer exactly the
  // collection types the current selection can produce.
  const collectionTypes = useMemo((): MediaItemType[] => {
    switch (submittedType) {
      case 'show':
        return ['show', 'season', 'episode']
      case 'season':
        return ['season', 'episode']
      case 'episode':
        return ['episode']
      case 'movie':
        return ['movie']
      default:
        return []
    }
  }, [submittedType])

  const actionOptions = useMemo((): MediaAction[] => {
    // A mixed selection has no single type, so no collection can take it.
    const actions: MediaAction[] = mediaType
      ? [
          'collection-add',
          'collection-remove',
          'collection-remove-all',
          'exclusion-add',
          'exclusion-remove',
        ]
      : ['exclusion-add', 'exclusion-remove']

    return hiddenActions
      ? actions.filter((action) => !hiddenActions.includes(action))
      : actions
  }, [mediaType, hiddenActions])

  // Derived, not synced: a page can hide actions, and a mixed selection drops
  // the collection ones, so fall back to the first one still offered.
  const selectedAction =
    pickedAction && actionOptions.includes(pickedAction)
      ? pickedAction
      : actionOptions[0]

  const isCollectionAction = selectedAction.startsWith('collection-')
  const isEveryCollection = targetsEveryCollection(selectedAction)
  // Only an exclusion can be scoped to every collection at once; the collection
  // actions say so through their own entry instead.
  const allowsAllCollections = !lockedCollection && !isCollectionAction

  const seasonOptions = useMemo(
    () => [
      { id: '', title: 'All seasons' },
      ...(seasonsQuery.data ?? []).map((season) => ({
        id: season.id,
        title: season.title,
      })),
    ],
    [seasonsQuery.data],
  )

  const episodeOptions = useMemo(
    () => [
      { id: '', title: 'All episodes' },
      ...(episodesQuery.data ?? []).map((episode) => ({
        id: episode.id,
        title: `Episode ${episode.index}`,
      })),
    ],
    [episodesQuery.data],
  )

  const collectionOptions = useMemo((): { id: number; title: string }[] => {
    if (lockedCollection) {
      return [lockedCollection]
    }

    return [
      ...(allowsAllCollections
        ? [{ id: ALL_COLLECTIONS, title: 'All collections' }]
        : []),
      ...(collectionsQuery.data ?? []).flatMap((collection) =>
        collection.id !== undefined && collectionTypes.includes(collection.type)
          ? [{ id: collection.id, title: collection.title }]
          : [],
      ),
    ]
  }, [
    lockedCollection,
    allowsAllCollections,
    collectionsQuery.data,
    collectionTypes,
  ])

  // Derived, not synced: narrowing or switching action drops options, so a
  // selection made before that is no longer offered and falls back to the first
  // one. Keeping the state lets it come back if the user widens again.
  const currentCollectionId = collectionOptions.some(
    (option) => option.id === selectedCollection,
  )
    ? selectedCollection
    : collectionOptions[0]?.id
  const isAllCollections = currentCollectionId === ALL_COLLECTIONS
  // Everything but the every-collection action needs a target to act on.
  const noCollectionSelectable =
    !isEveryCollection && currentCollectionId === undefined
  const noCollectionsAvailable =
    noCollectionSelectable && collectionsQuery.isSuccess

  const loading =
    seasonsQuery.isLoading ||
    episodesQuery.isLoading ||
    collectionsQuery.isLoading

  const loadErrorMessage = useMemo(() => {
    if (seasonsQuery.error) {
      return getApiErrorMessage(
        seasonsQuery.error,
        'Could not load the seasons',
      )
    }
    if (episodesQuery.error) {
      return getApiErrorMessage(
        episodesQuery.error,
        'Could not load the episodes',
      )
    }
    if (collectionsQuery.error) {
      return getApiErrorMessage(
        collectionsQuery.error,
        'Could not load the collections',
      )
    }
    return undefined
  }, [seasonsQuery.error, episodesQuery.error, collectionsQuery.error])

  const submit = async () => {
    if (submitting) return
    setSubmitting(true)
    setConfirmAllCollections(false)
    setErrorMessage(undefined)

    const collectionId =
      isEveryCollection || isAllCollections ? undefined : currentCollectionId

    try {
      const response = isCollectionAction
        ? await postBulkCollectionMedia({
            mediaIds: submittedIds,
            collectionId,
            action: selectedAction === 'collection-add' ? 0 : 1,
            // Guarded by actionOptions: a collection action needs a type.
            mediaType: submittedType as MediaItemType,
          })
        : await postBulkExclusions({
            mediaIds: submittedIds,
            collectionId,
            action: selectedAction === 'exclusion-add' ? 0 : 1,
          })

      const succeededIds = response.results
        .filter((result) => result.code === 1)
        .map((result) => result.mediaId)
      const failedIds = response.results
        .filter((result) => result.code !== 1)
        .map((result) => result.mediaId)

      if (isCollectionAction && succeededIds.length > 0) {
        await invalidateCollectionQueries(queryClient)
      }

      onSubmitted({
        action: selectedAction,
        collectionId,
        succeededIds,
        failedIds,
      })
    } catch (error) {
      setSubmitting(false)
      setErrorMessage(
        getApiErrorMessage(error, 'The selected items could not be updated'),
      )
    }
  }

  const handleSubmit = async () => {
    if (submitting || noCollectionSelectable) return

    // Adding a global exclusion clears the items' rule-group exclusions. For a
    // single item we can name them; for a selection the count is not worth N
    // status reads, so the copy stays general.
    if (
      selectedAction === 'exclusion-add' &&
      isAllCollections &&
      singleMediaId !== undefined
    ) {
      // Best-effort: if the read fails we cannot build the warning, so fall
      // through and submit rather than blocking the exclusion asked for.
      try {
        const status = await fetchMaintainerrStatusDetails({
          id: singleMediaId,
          getApiHandler: GetApiHandler,
        })
        const scoped = status.excludedFrom.filter((entry) => entry.targetPath)

        if (scoped.length > 0) {
          setAffectedExclusions(
            scoped.map((entry) => ({
              label: entry.label,
              targetPath: entry.targetPath as string,
            })),
          )
          setConfirmAllCollections(true)
          return
        }
      } catch {
        // Warning data unavailable - proceed without it.
      }
    }

    if (isEveryCollection || isAllCollections) {
      setAffectedExclusions([])
      setConfirmAllCollections(true)
      return
    }

    await submit()
  }

  const itemLabel = `${submittedIds.length} item${submittedIds.length === 1 ? '' : 's'}`

  return (
    <Modal
      loading={loading}
      backgroundClickable={false}
      onCancel={onCancel}
      title="Add / Remove Media"
      footerActions={
        <PendingButton
          buttonType="primary"
          className="ml-3"
          disabled={submitting || noCollectionSelectable}
          isPending={submitting}
          idleLabel="Submit"
          pendingLabel="Submitting..."
          onClick={() => {
            void handleSubmit()
          }}
        />
      }
      iconSvg={''}
    >
      {confirmAllCollections ? (
        <Modal
          backgroundClickable={false}
          onCancel={() => setConfirmAllCollections(false)}
          title="Confirmation Required"
          footerActions={
            <PendingButton
              buttonType="danger"
              className="ml-3"
              disabled={submitting}
              isPending={submitting}
              idleLabel="Proceed"
              pendingLabel="Submitting..."
              onClick={() => {
                void submit()
              }}
            />
          }
        >
          {affectedExclusions.length > 0 ? (
            <>
              Making this a global exclusion removes the following rule-group
              exclusions, and they will not return if you later remove the
              global exclusion:
              <ul className="mt-2 list-disc pl-5">
                {affectedExclusions.map((exclusion) => (
                  <li key={exclusion.targetPath}>
                    <button
                      type="button"
                      className="text-maintainerr underline transition hover:text-maintainerr-400"
                      onClick={() => {
                        // SPA nav (honours router basename); clear caches so the
                        // destination refetches fresh.
                        onCancel()
                        clearMaintainerrStatusDetailsCache()
                        void queryClient.invalidateQueries({
                          queryKey: ['collections'],
                        })
                        navigate(exclusion.targetPath)
                      }}
                    >
                      {exclusion.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              {actionLabels[selectedAction]} applies to {itemLabel} across every
              collection. For shows and seasons this covers everything they
              contain.
            </p>
          )}
        </Modal>
      ) : null}

      {noCollectionsAvailable ? (
        <Alert
          title="No collection in this library can take this selection. Create one from a rule first."
          type="warning"
        />
      ) : null}

      {(errorMessage ?? loadErrorMessage) ? (
        <Alert title={errorMessage ?? loadErrorMessage} type="error" />
      ) : null}

      <div className="mt-6">
        <FormItem label="Action">
          <Select
            name="Action-field"
            id="Action-field"
            value={selectedAction}
            onChange={(e: { target: { value: string } }) => {
              setPickedAction(e.target.value as MediaAction)
            }}
          >
            {actionOptions.map((action) => (
              <option key={action} value={action}>
                {actionLabels[action]}
              </option>
            ))}
          </Select>
        </FormItem>

        {canNarrow ? (
          <FormItem label="Seasons">
            <Select
              name="Seasons-field"
              id="Seasons-field"
              value={selectedSeasons ?? ''}
              onChange={(e: { target: { value: string } }) => {
                const value = e.target.value
                setSelectedEpisodes(undefined)
                setSelectedSeasons(value || undefined)
              }}
            >
              {seasonOptions.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.title}
                </option>
              ))}
            </Select>
          </FormItem>
        ) : null}

        {canNarrow && selectedSeasons ? (
          <FormItem label="Episodes">
            <Select
              name="Episodes-field"
              id="Episodes-field"
              value={selectedEpisodes ?? ''}
              onChange={(e: { target: { value: string } }) => {
                setSelectedEpisodes(e.target.value || undefined)
              }}
            >
              {episodeOptions.map((episode) => (
                <option key={episode.id} value={episode.id}>
                  {episode.title}
                </option>
              ))}
            </Select>
          </FormItem>
        ) : null}

        {isEveryCollection ? null : (
          <FormItem label="Collection">
            <Select
              name="Collection-field"
              id="Collection-field"
              value={currentCollectionId ?? ''}
              disabled={Boolean(lockedCollection)}
              onChange={(e: { target: { value: string } }) => {
                setSelectedCollection(+e.target.value)
              }}
            >
              {collectionOptions.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.title}
                </option>
              ))}
            </Select>
          </FormItem>
        )}

        <p className="mt-4 text-sm text-zinc-400">
          Applies to {itemLabel}.
          {!mediaType
            ? ' The selection mixes media types, so only exclusions can be applied to it.'
            : ''}
        </p>
      </div>
    </Modal>
  )
}

export default MediaActionModal
