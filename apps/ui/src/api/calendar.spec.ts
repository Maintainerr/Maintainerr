import { ServarrAction } from '@maintainerr/contracts'
import { describe, expect, it } from 'vitest'
import { buildCalendarDays } from './calendar'
import type { ICollection } from '../components/Collection'

const collection = (deleteAfterDays: number): ICollection =>
  ({
    id: 1,
    title: 'Sample collection',
    type: 'movie',
    arrAction: ServarrAction.DELETE,
    deleteAfterDays,
    media: [{ id: 1, addDate: '2026-01-01T00:00:00.000Z' }],
  }) as unknown as ICollection

describe('buildCalendarDays', () => {
  it('schedules an item on its deletion day', () => {
    const days = buildCalendarDays([collection(7)])

    expect(days.map((day) => day.dayKey)).toEqual(['2026-01-08'])
  })

  // A window saved before DELETE_AFTER_MAX_DAYS bounded it has no real date,
  // and the key used to come out as NaN-NaN-NaN (#3558).
  it('skips a window that lands outside Date range', () => {
    expect(buildCalendarDays([collection(999999999)])).toEqual([])
  })
})
