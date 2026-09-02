import { fireEvent, render, screen } from '../../test-utils/render'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type CalendarDay,
  type CalendarDetailItem,
  useCalendarEntryDetails,
  useCalendarOverlayData,
  useCalendarSchedule,
} from '../../api/calendar'
import { buildQuerySuccessResult } from '../../test-utils/queryResults'
import type { ICollection } from '../Collection'
import Calendar from './index'

// Partial mock: the query hooks are stubbed, but calendarEntryTitle stays
// real so the rendered entry titles go through the actual catalog lookup.
vi.mock('../../api/calendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/calendar')>()),
  useCalendarSchedule: vi.fn(),
  useCalendarOverlayData: vi.fn(),
  useCalendarEntryDetails: vi.fn(),
}))

describe('Calendar', () => {
  const useCalendarScheduleMock = vi.mocked(useCalendarSchedule)
  const useCalendarOverlayDataMock = vi.mocked(useCalendarOverlayData)
  const useCalendarEntryDetailsMock = vi.mocked(useCalendarEntryDetails)

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })

    const today = new Date()
    const dayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const calendarDays: CalendarDay[] = [
      {
        dayKey,
        totalScheduledCount: 2,
        items: [
          {
            id: 'delete',
            count: 2,
            references: [],
          },
        ],
      },
    ]
    const detailItems: CalendarDetailItem[] = [
      {
        mediaTitle: 'Example Movie',
        addedAt: '2026-04-01T00:00:00.000Z',
        collectionId: 7,
        collectionTitle: 'Soon Gone',
        mediaType: 'movie',
      },
    ]

    useCalendarScheduleMock.mockReturnValue(
      buildQuerySuccessResult(calendarDays),
    )
    const overlayCollections: ICollection[] = []
    useCalendarOverlayDataMock.mockReturnValue(
      buildQuerySuccessResult(overlayCollections),
    )
    useCalendarEntryDetailsMock.mockImplementation(
      (params: Parameters<typeof useCalendarEntryDetails>[0]) => {
        return buildQuerySuccessResult(params ? detailItems : [])
      },
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('moves from August 31 to September in month view', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 31, 12))

    render(
      <MemoryRouter>
        <Calendar />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeTruthy()
  })

  it('opens the scheduled items modal from a calendar entry', () => {
    render(
      <MemoryRouter>
        <Calendar />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete: 2 items' }))

    expect(screen.getAllByText('Example Movie').length).toBeGreaterThan(0)
    expect(
      screen
        .getAllByRole('link', { name: 'Soon Gone' })[0]
        ?.getAttribute('href'),
    ).toBe('/collections/7')
    expect(screen.getAllByText('Movie').length).toBeGreaterThan(0)
  })
})
