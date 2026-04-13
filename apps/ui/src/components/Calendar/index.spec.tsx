import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type CalendarDay,
  type CalendarDetailItem,
  useCalendarEntryDetails,
  useCalendarOverlayData,
  useCalendarSchedule,
} from '../../api/calendar'
import Calendar from './index'

vi.mock('../../api/calendar', () => ({
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
            id: 'Delete',
            title: 'Delete: 2 items',
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

    useCalendarScheduleMock.mockReturnValue({
      data: calendarDays,
      isLoading: false,
    } as ReturnType<typeof useCalendarSchedule>)
    useCalendarOverlayDataMock.mockReturnValue({
      data: [],
    } as ReturnType<typeof useCalendarOverlayData>)
    useCalendarEntryDetailsMock.mockImplementation(
      (params: Parameters<typeof useCalendarEntryDetails>[0]) => {
        return {
          data: params ? detailItems : [],
          isLoading: false,
        } as ReturnType<typeof useCalendarEntryDetails>
      },
    )
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
