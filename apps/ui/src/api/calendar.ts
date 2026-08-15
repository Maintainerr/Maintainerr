import { plural, t } from '@lingui/core/macro'
import { MediaItemType, ServarrAction } from '@maintainerr/contracts'
import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import type { ICollection, ICollectionMedia } from '../components/Collection'
import GetApiHandler from '../utils/ApiHandler'

export type CalendarEntryReference = {
  collectionId: number
  mediaId: number
  mediaServerId: string
  addDate: Date
}

export type CalendarEntry = {
  id: CalendarActionKey
  count: number
  references: CalendarEntryReference[]
}

export type CalendarDay = {
  dayKey: string
  totalScheduledCount: number
  items: CalendarEntry[]
}

export type CalendarDetailItem = {
  mediaTitle: string
  addedAt: string
  collectionId: number
  collectionTitle: string
  mediaType: MediaItemType
}

const pad2 = (n: number) => String(n).padStart(2, '0')

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate())

/**
 * A calendar entry is keyed by what the action *is*, never by its label. The
 * key groups entries and travels into a TanStack Query cache key, so a
 * translated id would regroup the calendar and split the cache the moment the
 * language changed. Distinct keys mirror the distinct English labels this
 * screen has always merged on.
 */
export type CalendarActionKey =
  | 'delete'
  | 'unmonitor-delete'
  | 'unmonitor-keep'
  | 'unmonitor-delete-existing'
  | 'unmonitor-delete-empty-show'
  | 'unmonitor-keep-empty-show'
  | 'delete-empty-show'
  | 'unmonitor-empty-show'
  | 'change-quality'
  | 'do-nothing'
  | 'scheduled'

const actionLabelFor = (key: CalendarActionKey): string => {
  switch (key) {
    case 'delete':
      return t`Delete`
    case 'unmonitor-delete':
      return t`Unmonitor/Delete`
    case 'unmonitor-keep':
      return t`Unmonitor/Keep`
    case 'unmonitor-delete-existing':
      return t`Unmonitor/Delete Existing`
    case 'unmonitor-delete-empty-show':
      return t`Unmonitor/Delete + Delete Empty Show`
    case 'unmonitor-keep-empty-show':
      return t`Unmonitor/Keep + Unmonitor Empty Show`
    case 'delete-empty-show':
      return t`Delete Empty Show`
    case 'unmonitor-empty-show':
      return t`Unmonitor Empty Show`
    case 'change-quality':
      return t`Change Quality`
    case 'do-nothing':
      return t`Do nothing`
    default:
      return t`Scheduled Action`
  }
}

/**
 * Resolved at render time by the (context-subscribed) calendar component, so
 * the label follows a locale switch; entries themselves carry only the key.
 */
export const calendarEntryTitle = (
  entry: Pick<CalendarEntry, 'id' | 'count'>,
): string => {
  const actionLabel = actionLabelFor(entry.id)
  // Named so the count message merges with the identical one elsewhere
  // instead of extracting a bare {0}.
  const itemCount = entry.count
  const itemCountText = plural(itemCount, { one: '# item', other: '# items' })
  return t`${{ actionLabel }}: ${{ itemCount: itemCountText }}`
}

const getMovieActionKey = (action: ServarrAction): CalendarActionKey => {
  switch (action) {
    case ServarrAction.DELETE:
      return 'delete'
    case ServarrAction.UNMONITOR_DELETE_ALL:
      return 'unmonitor-delete'
    case ServarrAction.UNMONITOR:
      return 'unmonitor-keep'
    case ServarrAction.CHANGE_QUALITY_PROFILE:
      return 'change-quality'
    case ServarrAction.DO_NOTHING:
      return 'do-nothing'
    default:
      return 'scheduled'
  }
}

const getShowActionKey = (action: ServarrAction): CalendarActionKey => {
  switch (action) {
    case ServarrAction.DELETE:
      return 'delete'
    case ServarrAction.UNMONITOR_DELETE_ALL:
      return 'unmonitor-delete'
    case ServarrAction.UNMONITOR_DELETE_EXISTING:
      return 'unmonitor-delete-existing'
    case ServarrAction.UNMONITOR:
      return 'unmonitor-keep'
    case ServarrAction.CHANGE_QUALITY_PROFILE:
      return 'change-quality'
    case ServarrAction.DO_NOTHING:
      return 'do-nothing'
    default:
      return 'scheduled'
  }
}

const getSeasonActionKey = (action: ServarrAction): CalendarActionKey => {
  switch (action) {
    case ServarrAction.DELETE:
      return 'unmonitor-delete'
    case ServarrAction.DELETE_SHOW_IF_EMPTY:
      return 'unmonitor-delete-empty-show'
    case ServarrAction.UNMONITOR_DELETE_EXISTING:
      return 'unmonitor-delete-existing'
    case ServarrAction.UNMONITOR:
      return 'unmonitor-keep'
    case ServarrAction.UNMONITOR_SHOW_IF_EMPTY:
      return 'unmonitor-keep-empty-show'
    case ServarrAction.DO_NOTHING:
      return 'do-nothing'
    default:
      return 'scheduled'
  }
}

const getEpisodeActionKey = (action: ServarrAction): CalendarActionKey => {
  switch (action) {
    case ServarrAction.DELETE:
      return 'unmonitor-delete'
    case ServarrAction.UNMONITOR:
      return 'unmonitor-keep'
    case ServarrAction.DO_NOTHING:
      return 'do-nothing'
    default:
      return 'scheduled'
  }
}

const getGenericActionKey = (action: ServarrAction): CalendarActionKey => {
  switch (action) {
    case ServarrAction.DELETE:
      return 'delete'
    case ServarrAction.UNMONITOR_DELETE_ALL:
      return 'unmonitor-delete'
    case ServarrAction.UNMONITOR_DELETE_EXISTING:
      return 'unmonitor-delete-existing'
    case ServarrAction.UNMONITOR:
      return 'unmonitor-keep'
    case ServarrAction.DELETE_SHOW_IF_EMPTY:
      return 'delete-empty-show'
    case ServarrAction.UNMONITOR_SHOW_IF_EMPTY:
      return 'unmonitor-empty-show'
    case ServarrAction.CHANGE_QUALITY_PROFILE:
      return 'change-quality'
    default:
      return 'scheduled'
  }
}

const getActionKey = (collection: ICollection): CalendarActionKey => {
  const action = collection.arrAction as ServarrAction
  const hasRadarr = collection.radarrSettingsId != null

  if (hasRadarr || collection.type === 'movie') {
    return getMovieActionKey(action)
  }

  if (collection.type === 'show') {
    return getShowActionKey(action)
  }

  if (collection.type === 'season') {
    return getSeasonActionKey(action)
  }

  if (collection.type === 'episode') {
    return getEpisodeActionKey(action)
  }

  return getGenericActionKey(action)
}

const buildCalendarDays = (collections: ICollection[] | undefined) => {
  const itemsByKey = new Map<string, CalendarEntry[]>()

  if (!collections) {
    return []
  }

  collections.forEach((collection) => {
    if (
      collection.arrAction === ServarrAction.DO_NOTHING ||
      collection.deleteAfterDays == null
    ) {
      return
    }

    const deleteAfterDays = collection.deleteAfterDays ?? 0

    collection.media.forEach((media: ICollectionMedia) => {
      if (!media.addDate) {
        return
      }

      const deleteDate = startOfDay(new Date(media.addDate))
      deleteDate.setDate(deleteDate.getDate() + deleteAfterDays)

      const key = `${deleteDate.getFullYear()}-${pad2(deleteDate.getMonth() + 1)}-${pad2(deleteDate.getDate())}`
      const actionKey = getActionKey(collection)
      const items = itemsByKey.get(key) ?? []
      const existingItem = items.find((item) => item.id === actionKey)

      if (existingItem) {
        existingItem.count += 1
        existingItem.references.push({
          collectionId: collection.id!,
          mediaId: media.id,
          mediaServerId: media.mediaServerId,
          addDate: media.addDate,
        })
      } else {
        items.push({
          id: actionKey,
          count: 1,
          references: [
            {
              collectionId: collection.id!,
              mediaId: media.id,
              mediaServerId: media.mediaServerId,
              addDate: media.addDate,
            },
          ],
        })
      }

      itemsByKey.set(key, items)
    })
  })

  return [...itemsByKey.entries()]
    .sort(([leftDayKey], [rightDayKey]) =>
      leftDayKey.localeCompare(rightDayKey),
    )
    .map(([dayKey, items]) => ({
      dayKey,
      totalScheduledCount: items.reduce((sum, item) => sum + item.count, 0),
      // Ordered by the stable key, so the chips keep one order per day in
      // every language.
      items: items.sort((left, right) => left.id.localeCompare(right.id)),
    }))
}

const getMediaTitle = (media: ICollectionMedia) => {
  const mediaData = media.mediaData

  if (!mediaData) {
    return media.mediaServerId
  }

  if (mediaData.type === 'season') {
    const showTitle = mediaData.grandparentTitle || mediaData.parentTitle || ''
    // A library can leave the number unset - Jellyfin files those under a
    // "Season Unknown" container - so name the season itself instead.
    const season =
      mediaData.index != null ? `S${pad2(mediaData.index)}` : mediaData.title

    return [showTitle, season].filter(Boolean).join(' - ')
  }

  if (mediaData.type === 'episode') {
    const showTitle = mediaData.grandparentTitle || mediaData.parentTitle || ''
    const seasonEpisode =
      mediaData.parentIndex != null && mediaData.index != null
        ? `S${pad2(mediaData.parentIndex)}E${pad2(mediaData.index)}`
        : mediaData.index != null
          ? `E${pad2(mediaData.index)}`
          : ''

    return [showTitle, seasonEpisode].filter(Boolean).join(' - ')
  }

  return (
    mediaData.grandparentTitle ||
    mediaData.parentTitle ||
    mediaData.title ||
    media.mediaServerId
  )
}

type UseCalendarScheduleOptions = Omit<
  UseQueryOptions<
    ICollection[],
    Error,
    CalendarDay[],
    ['collections', 'overlay-data']
  >,
  'queryKey' | 'queryFn'
>

type UseCalendarOverlayDataOptions = Omit<
  UseQueryOptions<
    ICollection[],
    Error,
    ICollection[],
    ['collections', 'overlay-data']
  >,
  'queryKey' | 'queryFn'
>

export const useCalendarOverlayData = (
  options?: UseCalendarOverlayDataOptions,
) => {
  return useQuery<
    ICollection[],
    Error,
    ICollection[],
    ['collections', 'overlay-data']
  >({
    queryKey: ['collections', 'overlay-data'],
    queryFn: async () => {
      return await GetApiHandler<ICollection[]>('/collections/overlay-data')
    },
    staleTime: 60 * 1000,
    ...options,
  })
}

export const useCalendarSchedule = (options?: UseCalendarScheduleOptions) => {
  return useQuery<
    ICollection[],
    Error,
    CalendarDay[],
    ['collections', 'overlay-data']
  >({
    queryKey: ['collections', 'overlay-data'],
    queryFn: async () => {
      return await GetApiHandler<ICollection[]>('/collections/overlay-data')
    },
    select: buildCalendarDays,
    staleTime: 60 * 1000,
    ...options,
  })
}

export type CalendarEntryDetailsParams = {
  item: CalendarEntry
  collections: ICollection[]
}

type UseCalendarEntryDetailsQueryKey = [
  'calendar',
  'details',
  string,
  CalendarEntryReference[],
  Array<[number | undefined, ICollection]>,
]

type UseCalendarEntryDetailsOptions = Omit<
  UseQueryOptions<
    CalendarDetailItem[],
    Error,
    CalendarDetailItem[],
    UseCalendarEntryDetailsQueryKey
  >,
  'queryKey' | 'queryFn'
>

export const useCalendarEntryDetails = (
  params?: CalendarEntryDetailsParams,
  options?: UseCalendarEntryDetailsOptions,
) => {
  const entryId = params?.item.id ?? ''
  const references = params?.item.references ?? []
  const collectionEntries: Array<[number | undefined, ICollection]> = (
    params?.collections ?? []
  ).map((collection): [number | undefined, ICollection] => [
    collection.id,
    collection,
  ])
  const queryEnabled = entryId.length > 0 && references.length > 0

  return useQuery<
    CalendarDetailItem[],
    Error,
    CalendarDetailItem[],
    UseCalendarEntryDetailsQueryKey
  >({
    queryKey: ['calendar', 'details', entryId, references, collectionEntries],
    queryFn: async ({ queryKey }) => {
      const [
        ,
        ,
        selectedEntryId,
        selectedReferences,
        selectedCollectionEntries,
      ] = queryKey

      if (!selectedEntryId || selectedReferences.length === 0) {
        return []
      }

      const collectionsById = new Map<number | undefined, ICollection>(
        selectedCollectionEntries,
      )
      const referencesByCollection = selectedReferences.reduce(
        (map, reference) => {
          const refs = map.get(reference.collectionId) ?? []
          refs.push(reference)
          map.set(reference.collectionId, refs)
          return map
        },
        new Map<number, CalendarEntryReference[]>(),
      )

      const collectionResults = await Promise.all(
        [...referencesByCollection.entries()].map(
          async ([collectionId, refs]) => {
            const collection = collectionsById.get(collectionId)
            const mediaCount =
              collection?.mediaCount ?? collection?.media.length ?? 25

            const mediaResponse = await GetApiHandler<{
              totalSize: number
              items: ICollectionMedia[]
            }>(
              `/collections/media/${collectionId}/content/1?size=${mediaCount}`,
            )

            const mediaIds = new Set(refs.map((ref) => ref.mediaId))
            const mediaServerIds = new Set(refs.map((ref) => ref.mediaServerId))
            const addDateByMediaId = new Map(
              refs.map((ref) => [ref.mediaId, ref.addDate]),
            )
            const addDateByMediaServerId = new Map(
              refs.map((ref) => [ref.mediaServerId, ref.addDate]),
            )

            return mediaResponse.items
              .filter(
                (media) =>
                  mediaIds.has(media.id) ||
                  mediaServerIds.has(media.mediaServerId),
              )
              .map((media) => ({
                mediaTitle: getMediaTitle(media),
                addedAt: String(
                  addDateByMediaId.get(media.id) ??
                    addDateByMediaServerId.get(media.mediaServerId) ??
                    media.addDate,
                ),
                collectionId,
                collectionTitle:
                  collection?.title ??
                  media.collection?.title ??
                  t`Collection ${{ collectionId }}`,
                mediaType: media.mediaData?.type ?? collection?.type ?? 'movie',
              }))
          },
        ),
      )

      return collectionResults
        .flat()
        .sort((left, right) => left.mediaTitle.localeCompare(right.mediaTitle))
    },
    enabled: queryEnabled && (options?.enabled ?? true),
    staleTime: 0,
    ...options,
  })
}
