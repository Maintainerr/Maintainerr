import { MediaItemType, ServarrAction } from '@maintainerr/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import GetApiHandler from '../../utils/ApiHandler'
import type { ICollection, ICollectionMedia } from '../Collection'
import Modal from '../Common/Modal'

type CalendarViewMode = 'month' | 'week'

type CalendarItem = {
  id: string
  title: string
  count: number
  references: {
    collectionId: number
    mediaId: number
    mediaServerId: string
    addDate: Date
  }[]
}

type CalendarModalItem = {
  mediaTitle: string
  addedAt: string
  collectionId: number
  collectionTitle: string
  mediaType: MediaItemType
}

type SelectedCalendarEntry = {
  item: CalendarItem
  date: Date
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const MONTH_NAMES_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const pad2 = (n: number) => String(n).padStart(2, '0')

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate())
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const startOfWeekSunday = (d: Date) => {
  const x = startOfDay(d)
  const day = x.getDay() // 0..6 (Sun..Sat)
  x.setDate(x.getDate() - day)
  return x
}

const addDays = (d: Date, days: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

const addMonths = (d: Date, months: number) => {
  const x = new Date(d)
  x.setMonth(x.getMonth() + months)
  return x
}

const getDayKey = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

const formatMonthTitle = (d: Date) =>
  d.toLocaleString(undefined, { month: 'long', year: 'numeric' })

const formatShortMonthDay = (date: Date) =>
  `${MONTH_NAMES_SHORT[date.getMonth()]} ${date.getDate()}`

const formatLongMonthDay = (date: Date) =>
  `${MONTH_NAMES_LONG[date.getMonth()]} ${date.getDate()}`

const formatWeekTitle = (start: Date, end: Date, useShortMonths = false) => {
  const formatMonthDay = useShortMonths
    ? formatShortMonthDay
    : formatLongMonthDay
  const sameYear = start.getFullYear() === end.getFullYear()

  if (sameYear) {
    return `${formatMonthDay(start)} - ${formatMonthDay(end)}, ${start.getFullYear()}`
  }

  return `${formatMonthDay(start)}, ${start.getFullYear()} - ${formatMonthDay(end)}, ${end.getFullYear()}`
}

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

const buildItemsByDayKey = (collections: ICollection[] | undefined) => {
  const itemsByKey = new Map<string, CalendarItem[]>()

  if (!collections) return itemsByKey

  collections.forEach((collection) => {
    if (
      collection.arrAction === ServarrAction.DO_NOTHING ||
      collection.deleteAfterDays == null
    ) {
      return
    }

    collection.media.forEach((media: ICollectionMedia) => {
      if (!media.addDate) return

      const deleteDate = startOfDay(new Date(media.addDate))
      deleteDate.setDate(deleteDate.getDate() + collection.deleteAfterDays!)

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

  return itemsByKey
}

const getMediaTitle = (media: ICollectionMedia) => {
  const mediaData = media.mediaData

  if (!mediaData) return media.mediaServerId

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

const formatAddedAt = (value: Date | string) => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const formatScheduledDate = (value: Date) =>
  value.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

const getMediaTypeLabel = (mediaType: MediaItemType) => {
  switch (mediaType) {
    case 'movie':
      return 'Movie'
    case 'show':
      return 'Show'
    case 'season':
      return 'Season'
    case 'episode':
      return 'Episode'
    default:
      return 'Media'
  }
}

const useScrollbarCompensation = (
  enabled: boolean,
): [React.RefObject<HTMLDivElement | null>, number] => {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const [scrollbarWidth, setScrollbarWidth] = useState(0)

  useEffect(() => {
    if (!enabled) {
      requestAnimationFrame(() => setScrollbarWidth(0))
      return
    }

    const updateScrollbarWidth = () => {
      const element = elementRef.current

      if (!element) {
        setScrollbarWidth(0)
        return
      }

      setScrollbarWidth(element.offsetWidth - element.clientWidth)
    }

    const frame = requestAnimationFrame(updateScrollbarWidth)
    window.addEventListener('resize', updateScrollbarWidth)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateScrollbarWidth)
    }
  }, [enabled])

  return [elementRef, scrollbarWidth]
}

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // Tailwind "sm" breakpoint is 640px, so < 640 = mobile
    const mql = window.matchMedia('(max-width: 639px)')
    const onChange = () => setIsMobile(mql.matches)
    onChange()

    mql.addEventListener?.('change', onChange)
    return () => mql.removeEventListener?.('change', onChange)
  }, [])

  return isMobile
}

const CalendarPage = () => {
  const isMobile = useIsMobile()
  const { data: collections, isLoading } = useQuery<ICollection[]>({
    queryKey: ['calendar', 'collections', 'overlay-data'],
    queryFn: async () => {
      return await GetApiHandler<ICollection[]>('/collections/overlay-data')
    },
    staleTime: 60 * 1000,
  })
  const [selectedEntry, setSelectedEntry] =
    useState<SelectedCalendarEntry | null>(null)
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null)
  const selectedEntryId = selectedEntry?.item.id ?? null
  const selectedEntryReferences = selectedEntry?.item.references ?? []
  const collectionLookup = useMemo(
    () =>
      new Map(
        (collections ?? []).map((collection) => [collection.id, collection]),
      ),
    [collections],
  )
  const [modalTableBodyRef, modalTableScrollbarWidth] =
    useScrollbarCompensation(selectedEntry != null)
  const { data: modalItems, isLoading: modalLoading } = useQuery<
    CalendarModalItem[]
  >({
    queryKey: [
      'calendar',
      'details',
      selectedEntryId,
      selectedEntryReferences,
      [...collectionLookup.entries()],
    ],
    queryFn: async ({ queryKey }) => {
      const [, , entryId, references, collectionEntries] = queryKey as [
        string,
        string,
        string | null,
        CalendarItem['references'],
        [number | undefined, ICollection][],
      ]

      if (!entryId) {
        return []
      }

      const collectionsById = new Map<number | undefined, ICollection>(
        collectionEntries,
      )
      const referencesByCollection = references.reduce(
        (map, reference) => {
          const refs = map.get(reference.collectionId) ?? []
          refs.push(reference)
          map.set(reference.collectionId, refs)
          return map
        },
        new Map<number, CalendarItem['references']>(),
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
                addedAt: formatAddedAt(
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
    enabled: selectedEntry != null,
    staleTime: 0,
  })

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month')
  const [cursorDate, setCursorDate] = useState<Date>(() =>
    startOfDay(new Date()),
  )
  const effectiveViewMode: CalendarViewMode = isMobile ? 'week' : viewMode

  const today = useMemo(() => startOfDay(new Date()), [])
  const itemsByKey = useMemo(
    () => buildItemsByDayKey(collections),
    [collections],
  )

  const weekRange = useMemo(() => {
    const weekStart = startOfWeekSunday(cursorDate)
    const weekEnd = addDays(weekStart, 6)

    return { weekStart, weekEnd }
  }, [cursorDate])

  const headerTitle = useMemo(() => {
    if (!isMobile && effectiveViewMode === 'month') {
      return formatMonthTitle(cursorDate)
    }

    return formatWeekTitle(weekRange.weekStart, weekRange.weekEnd)
  }, [cursorDate, effectiveViewMode, isMobile, weekRange])

  const mobileWeekHeaderTitle = useMemo(() => {
    if (!isMobile && effectiveViewMode === 'month') return null

    return formatWeekTitle(weekRange.weekStart, weekRange.weekEnd, true)
  }, [effectiveViewMode, isMobile, weekRange])

  const gridDates = useMemo(() => {
    // Mobile is week-only
    if (isMobile || effectiveViewMode === 'week') {
      const weekStart = startOfWeekSunday(cursorDate)
      return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    }

    // month view: 6-week grid starting at the Sunday before the 1st
    const firstOfMonth = new Date(
      cursorDate.getFullYear(),
      cursorDate.getMonth(),
      1,
    )
    const gridStart = startOfWeekSunday(firstOfMonth)
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [cursorDate, effectiveViewMode, isMobile])

  const onPrev = () => {
    setCursorDate((d) =>
      !isMobile && effectiveViewMode === 'month'
        ? addMonths(d, -1)
        : addDays(d, -7),
    )
  }

  const onNext = () => {
    setCursorDate((d) =>
      !isMobile && effectiveViewMode === 'month'
        ? addMonths(d, 1)
        : addDays(d, 7),
    )
  }

  const onToday = () => setCursorDate(today)

  const isOutsideMonth = (d: Date) =>
    !isMobile &&
    effectiveViewMode === 'month' &&
    d.getMonth() !== cursorDate.getMonth()

  const getItemsForDay = (d: Date) => {
    return itemsByKey.get(getDayKey(d)) ?? []
  }

  const openEntryModal = (item: CalendarItem, date: Date) => {
    setSelectedEntry({ item, date })
  }

  return (
    <div className="w-full px-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-white">
            {mobileWeekHeaderTitle ? (
              <>
                <span className="sm:hidden">{mobileWeekHeaderTitle}</span>
                <span className="hidden sm:inline">{headerTitle}</span>
              </>
            ) : (
              headerTitle
            )}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View mode (hidden on mobile; mobile is week-only) */}
          <div className="hidden items-center gap-2 sm:flex">
            <label className="text-sm text-zinc-300">View</label>
            <select
              className="h-10 min-w-[7.5rem] rounded-md border border-zinc-700 bg-zinc-900 px-3 pr-9 text-sm text-white shadow-sm outline-none focus:border-amber-500"
              value={viewMode}
              onChange={(e) => {
                const next = e.target.value as CalendarViewMode
                setViewMode(next)
              }}
            >
              <option value="month">Month</option>
              <option value="week">Week</option>
            </select>
          </div>

          {/* Nav controls */}
          <button
            className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white hover:bg-zinc-800"
            type="button"
            onClick={onPrev}
          >
            Prev
          </button>
          <button
            className="h-10 rounded-md bg-amber-600 px-3 text-sm font-medium text-zinc-900 shadow-md hover:bg-amber-500"
            type="button"
            onClick={onToday}
          >
            Today
          </button>
          <button
            className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white hover:bg-zinc-800"
            type="button"
            onClick={onNext}
          >
            Next
          </button>
        </div>
      </div>

      {/* Calendar container */}
      <div className="mt-6 overflow-hidden rounded-xl border border-zinc-700/60 bg-zinc-700/40 shadow-lg backdrop-blur">
        {/* Weekday header row (desktop only) */}
        <div className="hidden grid-cols-7 border-b border-zinc-700/60 bg-zinc-700/70 sm:grid">
          {DAY_NAMES.map((d) => (
            <div
              key={d}
              className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-200"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Body */}
        <div
          className={[
            // Mobile: one column. Desktop: 7 columns (table-like).
            'grid gap-px bg-zinc-700/60',
            isMobile ? 'grid-cols-1' : 'grid-cols-7',
          ].join(' ')}
        >
          {gridDates.map((date) => {
            const dayKey = getDayKey(date)
            const items = getItemsForDay(date)
            const totalScheduledCount = items.reduce(
              (sum, item) => sum + item.count,
              0,
            )
            const defaultVisibleCount = isMobile ? 5 : 2
            const isExpanded = expandedDayKey === dayKey
            const visibleItems = isExpanded
              ? items
              : items.slice(0, defaultVisibleCount)
            const hiddenCount = Math.max(items.length - defaultVisibleCount, 0)
            const outside = isOutsideMonth(date)
            const isToday = isSameDay(date, today)
            const dayName = DAY_NAMES[date.getDay()]
            const dateLabel = date.toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })

            return (
              <div
                key={date.toISOString()}
                className={[
                  isMobile ? 'min-h-[4.5rem]' : 'min-h-[7.25rem]',
                  'bg-zinc-800/60 p-2 transition-colors hover:bg-zinc-800/80',
                  outside ? 'opacity-60' : '',
                ].join(' ')}
              >
                {/* Day header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={[
                        'flex h-7 min-w-[1.75rem] items-center justify-center rounded-md px-2 text-xs font-semibold',
                        isToday
                          ? 'bg-amber-500 text-zinc-900'
                          : 'border border-zinc-700/60 bg-zinc-800 text-zinc-100',
                      ].join(' ')}
                      title={date.toDateString()}
                    >
                      {date.getDate()}
                    </div>

                    {/* Mobile: show weekday + full date label */}
                    <div className="sm:hidden">
                      <div className="text-sm font-semibold text-zinc-100">
                        {dayName}
                      </div>
                      <div className="text-xs text-zinc-300/80">
                        {dateLabel}
                      </div>
                    </div>
                  </div>

                  {totalScheduledCount > 0 && (
                    <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200">
                      {totalScheduledCount} scheduled
                    </div>
                  )}
                </div>

                {/* Items */}
                <div className="mt-2 flex flex-col gap-1">
                  {items.length === 0 ? (
                    <div className="select-none text-xs text-zinc-400/70">
                      {isLoading ? 'Loading...' : 'No scheduled actions'}
                    </div>
                  ) : (
                    visibleItems.map((it) => (
                      <button
                        key={it.id}
                        className="truncate rounded-md border border-zinc-600/60 bg-zinc-700/40 px-2 py-1 text-left text-xs text-zinc-100 hover:border-amber-500/40"
                        title={it.title}
                        type="button"
                        onClick={() => openEntryModal(it, date)}
                      >
                        {it.title}
                      </button>
                    ))
                  )}

                  {hiddenCount > 0 && !isExpanded && (
                    <button
                      className="w-fit text-left text-xs text-amber-300 hover:text-amber-200 hover:underline"
                      type="button"
                      onClick={() => setExpandedDayKey(dayKey)}
                    >
                      +{hiddenCount} more...
                    </button>
                  )}

                  {isExpanded && items.length > defaultVisibleCount && (
                    <button
                      className="w-fit text-left text-xs text-amber-300 hover:text-amber-200 hover:underline"
                      type="button"
                      onClick={() => setExpandedDayKey(null)}
                    >
                      Show less
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {selectedEntry && (
        <Modal
          title={selectedEntry.item.title}
          onCancel={() => setSelectedEntry(null)}
          cancelText="Close"
          size="4xl"
        >
          {modalLoading ? (
            <div className="py-6 text-center text-sm text-zinc-300">
              Loading scheduled items...
            </div>
          ) : modalItems && modalItems.length > 0 ? (
            <div className="-mt-1 space-y-2">
              <div className="text-center text-sm font-medium text-zinc-300">
                {formatScheduledDate(selectedEntry.date)}
              </div>
              <div className="space-y-2 sm:hidden">
                {modalItems.map((item, index) => (
                  <div
                    key={`${item.collectionId}-${item.mediaTitle}-${index}`}
                    className="rounded-md border border-zinc-600/60 bg-zinc-800/40 px-3 py-3"
                  >
                    <div className="truncate text-sm font-medium text-zinc-100">
                      {item.mediaTitle}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div>
                        <div className="text-zinc-400">Added On</div>
                        <div className="text-zinc-300">{item.addedAt}</div>
                      </div>
                      <div>
                        <div className="text-zinc-400">Type</div>
                        <div className="text-zinc-300">
                          {getMediaTypeLabel(item.mediaType)}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-zinc-400">Collection</div>
                        <Link
                          className="text-amber-300 hover:text-amber-200 hover:underline"
                          to={`/collections/${item.collectionId}`}
                        >
                          {item.collectionTitle}
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden sm:block">
                <div style={{ paddingRight: `${modalTableScrollbarWidth}px` }}>
                  <table className="w-full table-fixed">
                    <colgroup>
                      <col className="w-[46%]" />
                      <col className="w-[22%]" />
                      <col className="w-[22%]" />
                      <col className="w-[10%]" />
                    </colgroup>
                    <thead>
                      <tr className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                        <th className="border-b border-zinc-600 px-3 pb-2 text-left">
                          Media
                        </th>
                        <th className="border-b border-zinc-600 px-3 pb-2 text-center">
                          Added On
                        </th>
                        <th className="border-b border-zinc-600 px-3 pb-2 text-center">
                          Collection
                        </th>
                        <th className="border-b border-zinc-600 px-3 pb-2 text-center">
                          Type
                        </th>
                      </tr>
                    </thead>
                  </table>
                </div>
                <div
                  ref={modalTableBodyRef}
                  className="max-h-[26rem] overflow-y-auto"
                >
                  <table className="w-full table-fixed border-separate border-spacing-y-2">
                    <colgroup>
                      <col className="w-[46%]" />
                      <col className="w-[22%]" />
                      <col className="w-[22%]" />
                      <col className="w-[10%]" />
                    </colgroup>
                    <tbody>
                      {modalItems.map((item, index) => (
                        <tr
                          key={`${item.collectionId}-${item.mediaTitle}-${index}`}
                          className="rounded-md border border-zinc-600/60 bg-zinc-800/40"
                        >
                          <td
                            className="rounded-l-md border-y border-l border-zinc-600/60 bg-zinc-800/40 px-3 py-2 text-zinc-100"
                            title={item.mediaTitle}
                          >
                            <div className="truncate">{item.mediaTitle}</div>
                          </td>
                          <td
                            className="border-y border-zinc-600/60 bg-zinc-800/40 px-3 py-2 text-center text-zinc-300"
                            title={item.addedAt}
                          >
                            {item.addedAt}
                          </td>
                          <td className="border-y border-zinc-600/60 bg-zinc-800/40 px-3 py-2 text-center">
                            <Link
                              className="text-amber-300 hover:text-amber-200 hover:underline"
                              to={`/collections/${item.collectionId}`}
                            >
                              {item.collectionTitle}
                            </Link>
                          </td>
                          <td className="rounded-r-md border-y border-r border-zinc-600/60 bg-zinc-800/40 px-3 py-2 text-center text-zinc-300">
                            {getMediaTypeLabel(item.mediaType)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-zinc-400">
              No media items found for this scheduled action.
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

export default CalendarPage
