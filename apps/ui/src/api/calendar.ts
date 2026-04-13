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
  id: string
  title: string
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

const DEFAULT_ACTION_LABEL = 'Scheduled Action'

const formatCalendarItemTitle = (actionLabel: string, count: number) =>
  `${actionLabel}: ${count} items`

const getMovieActionLabel = (action: ServarrAction) => {
  switch (action) {
    case ServarrAction.DELETE:
      return 'Delete'
    case ServarrAction.UNMONITOR_DELETE_ALL:
      return 'Unmonitor/Delete'
    case ServarrAction.UNMONITOR:
      return 'Unmonitor/Keep'
    case ServarrAction.CHANGE_QUALITY_PROFILE:
      return 'Change Quality'
    case ServarrAction.DO_NOTHING:
      return 'Do nothing'
    default:
      return DEFAULT_ACTION_LABEL
  }
}

const getShowActionLabel = (action: ServarrAction) => {
  switch (action) {
    case ServarrAction.DELETE:
      return 'Delete'
    case ServarrAction.UNMONITOR_DELETE_ALL:
      return 'Unmonitor/Delete'
    case ServarrAction.UNMONITOR_DELETE_EXISTING:
      return 'Unmonitor/Delete Existing'
    case ServarrAction.UNMONITOR:
      return 'Unmonitor/Keep'
    case ServarrAction.CHANGE_QUALITY_PROFILE:
      return 'Change Quality'
    case ServarrAction.DO_NOTHING:
      return 'Do nothing'
    default:
      return DEFAULT_ACTION_LABEL
  }
}

const getSeasonActionLabel = (action: ServarrAction) => {
  switch (action) {
    case ServarrAction.DELETE:
      return 'Unmonitor/Delete'
    case ServarrAction.DELETE_SHOW_IF_EMPTY:
      return 'Unmonitor/Delete + Delete Empty Show'
    case ServarrAction.UNMONITOR_DELETE_EXISTING:
      return 'Unmonitor/Delete Existing'
    case ServarrAction.UNMONITOR:
      return 'Unmonitor/Keep'
    case ServarrAction.UNMONITOR_SHOW_IF_EMPTY:
      return 'Unmonitor/Keep + Unmonitor Empty Show'
    case ServarrAction.DO_NOTHING:
      return 'Do nothing'
    default:
      return DEFAULT_ACTION_LABEL
  }
}

const getEpisodeActionLabel = (action: ServarrAction) => {
  switch (action) {
    case ServarrAction.DELETE:
      return 'Unmonitor/Delete'
    case ServarrAction.UNMONITOR:
      return 'Unmonitor/Keep'
    case ServarrAction.DO_NOTHING:
      return 'Do nothing'
    default:
      return DEFAULT_ACTION_LABEL
  }
}

const getGenericActionLabel = (action: ServarrAction) => {
  switch (action) {
    case ServarrAction.DELETE:
      return 'Delete'
    case ServarrAction.UNMONITOR_DELETE_ALL:
      return 'Unmonitor/Delete'
    case ServarrAction.UNMONITOR_DELETE_EXISTING:
      return 'Unmonitor/Delete Existing'
    case ServarrAction.UNMONITOR:
      return 'Unmonitor/Keep'
    case ServarrAction.DELETE_SHOW_IF_EMPTY:
      return 'Delete Empty Show'
    case ServarrAction.UNMONITOR_SHOW_IF_EMPTY:
      return 'Unmonitor Empty Show'
    case ServarrAction.CHANGE_QUALITY_PROFILE:
      return 'Change Quality'
    default:
      return DEFAULT_ACTION_LABEL
  }
}

const getActionLabel = (collection: ICollection) => {
  const action = collection.arrAction as ServarrAction
  const hasRadarr = collection.radarrSettingsId != null

  if (hasRadarr || collection.type === 'movie') {
    return getMovieActionLabel(action)
  }

  if (collection.type === 'show') {
    return getShowActionLabel(action)
  }

  if (collection.type === 'season') {
    return getSeasonActionLabel(action)
  }

  if (collection.type === 'episode') {
    return getEpisodeActionLabel(action)
  }

  return getGenericActionLabel(action)
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
      const actionLabel = getActionLabel(collection)
      const items = itemsByKey.get(key) ?? []
      const existingItem = items.find((item) => item.id === actionLabel)

      if (existingItem) {
        existingItem.count += 1
        existingItem.title = formatCalendarItemTitle(
          actionLabel,
          existingItem.count,
        )
        existingItem.references.push({
          collectionId: collection.id!,
          mediaId: media.id,
          mediaServerId: media.mediaServerId,
          addDate: media.addDate,
        })
      } else {
        items.push({
          id: actionLabel,
          title: formatCalendarItemTitle(actionLabel, 1),
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
      items: items.sort((left, right) => left.title.localeCompare(right.title)),
    }))
}

const getMediaTitle = (media: ICollectionMedia) => {
  const mediaData = media.mediaData

  if (!mediaData) {
    return media.mediaServerId
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
    ['calendar', 'collections', 'overlay-data']
  >,
  'queryKey' | 'queryFn'
>

type UseCalendarOverlayDataOptions = Omit<
  UseQueryOptions<
    ICollection[],
    Error,
    ICollection[],
    ['calendar', 'collections', 'overlay-data']
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
    ['calendar', 'collections', 'overlay-data']
  >({
    queryKey: ['calendar', 'collections', 'overlay-data'],
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
    ['calendar', 'collections', 'overlay-data']
  >({
    queryKey: ['calendar', 'collections', 'overlay-data'],
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
                  `Collection ${collectionId}`,
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
