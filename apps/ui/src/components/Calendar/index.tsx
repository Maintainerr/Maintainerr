import type { MediaItemType } from '@maintainerr/contracts'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import {
  useCalendarEntryDetails,
  useCalendarOverlayData,
  useCalendarSchedule,
  type CalendarDay,
  type CalendarEntry,
} from '../../api/calendar'
import Button from '../Common/Button'
import { SmallLoadingSpinner } from '../Common/LoadingSpinner'
import Modal from '../Common/Modal'
import { Select } from '../Forms/Select'

type CalendarViewMode = 'month' | 'week'

type SelectedCalendarEntry = {
  item: CalendarEntry
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
  const day = x.getDay()
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
): [RefObject<HTMLDivElement | null>, number] => {
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
    const mql = window.matchMedia('(max-width: 639px)')
    const onChange = () => setIsMobile(mql.matches)
    onChange()

    mql.addEventListener?.('change', onChange)
    return () => mql.removeEventListener?.('change', onChange)
  }, [])

  return isMobile
}

const Calendar = () => {
  const isMobile = useIsMobile()
  const { data: calendarDays = [], isLoading } = useCalendarSchedule()
  const { data: collections = [] } = useCalendarOverlayData()
  const [selectedEntry, setSelectedEntry] =
    useState<SelectedCalendarEntry | null>(null)
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null)
  const [modalTableBodyRef, modalTableScrollbarWidth] =
    useScrollbarCompensation(selectedEntry != null)
  const { data: modalItems = [], isLoading: modalLoading } =
    useCalendarEntryDetails(
      selectedEntry
        ? {
            item: selectedEntry.item,
            collections,
          }
        : undefined,
      {
        enabled: selectedEntry != null,
      },
    )

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month')
  const [cursorDate, setCursorDate] = useState<Date>(() =>
    startOfDay(new Date()),
  )
  const effectiveViewMode: CalendarViewMode = isMobile ? 'week' : viewMode

  const today = useMemo(() => startOfDay(new Date()), [])
  const daysByKey = useMemo(
    () =>
      new Map<string, CalendarDay>(
        calendarDays.map((calendarDay) => [calendarDay.dayKey, calendarDay]),
      ),
    [calendarDays],
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
    if (isMobile || effectiveViewMode === 'week') {
      const weekStart = startOfWeekSunday(cursorDate)
      return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    }

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

  const getScheduleForDay = (d: Date) => {
    return daysByKey.get(getDayKey(d))
  }

  const openEntryModal = (item: CalendarEntry, date: Date) => {
    setSelectedEntry({ item, date })
  }

  return (
    <div className="w-full px-4">
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
          <div className="hidden w-[7.5rem] sm:block">
            <Select
              className="hover:border-zinc-500"
              value={viewMode}
              onChange={(e) => {
                setViewMode(e.target.value as CalendarViewMode)
              }}
            >
              <option value="month">Month</option>
              <option value="week">Week</option>
            </Select>
          </div>

          <Button className="h-10 px-3" type="button" onClick={onPrev}>
            Prev
          </Button>
          <Button
            buttonType="primary"
            className="h-10 px-3"
            type="button"
            onClick={onToday}
          >
            Today
          </Button>
          <Button className="h-10 px-3" type="button" onClick={onNext}>
            Next
          </Button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-zinc-700/60 bg-zinc-700/40 shadow-lg backdrop-blur">
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

        <div
          className={[
            'grid gap-px bg-zinc-700/60',
            isMobile ? 'grid-cols-1' : 'grid-cols-7',
          ].join(' ')}
        >
          {gridDates.map((date) => {
            const dayKey = getDayKey(date)
            const daySchedule = getScheduleForDay(date)
            const items = daySchedule?.items ?? []
            const totalScheduledCount = daySchedule?.totalScheduledCount ?? 0
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
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={[
                        'flex h-7 min-w-[1.75rem] items-center justify-center rounded-md px-2 text-xs font-semibold',
                        isToday
                          ? 'bg-maintainerr-600 text-white'
                          : 'border border-zinc-700/60 bg-zinc-800 text-zinc-100',
                      ].join(' ')}
                      title={date.toDateString()}
                    >
                      {date.getDate()}
                    </div>

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
                    <div className="rounded-md bg-maintainerrdark px-2 py-1 text-[10px] font-semibold text-white">
                      {totalScheduledCount} scheduled
                    </div>
                  )}
                </div>

                <div className="mt-2 flex flex-col gap-1">
                  {items.length === 0 ? (
                    <div className="select-none text-xs text-zinc-400/70">
                      {isLoading ? 'Loading...' : 'No scheduled actions'}
                    </div>
                  ) : (
                    visibleItems.map((item) => (
                      <button
                        key={item.id}
                        className="truncate rounded-md bg-maintainerr-600 px-2 py-1 text-left text-xs text-white hover:bg-maintainerr"
                        title={item.title}
                        type="button"
                        onClick={() => openEntryModal(item, date)}
                      >
                        {item.title}
                      </button>
                    ))
                  )}

                  {hiddenCount > 0 && !isExpanded && (
                    <button
                      className="w-fit text-left text-xs text-maintainerr hover:text-maintainerr-400 hover:underline"
                      type="button"
                      onClick={() => setExpandedDayKey(dayKey)}
                    >
                      +{hiddenCount} more...
                    </button>
                  )}

                  {isExpanded && items.length > defaultVisibleCount && (
                    <button
                      className="w-fit text-left text-xs text-maintainerr hover:text-maintainerr-400 hover:underline"
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
            <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 py-6 text-center text-sm text-zinc-300">
              <SmallLoadingSpinner className="h-8 w-8" />
              <div>Loading scheduled items...</div>
            </div>
          ) : modalItems.length > 0 ? (
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
                        <div className="text-zinc-300">
                          {formatAddedAt(item.addedAt)}
                        </div>
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
                          className="text-maintainerr hover:text-maintainerr-400 hover:underline"
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
                            title={formatAddedAt(item.addedAt)}
                          >
                            {formatAddedAt(item.addedAt)}
                          </td>
                          <td className="border-y border-zinc-600/60 bg-zinc-800/40 px-3 py-2 text-center">
                            <Link
                              className="text-maintainerr hover:text-maintainerr-400 hover:underline"
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

export default Calendar
