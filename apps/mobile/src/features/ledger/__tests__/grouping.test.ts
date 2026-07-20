import type { EntryWithTags } from '@/data'

import { formatDayTitle, groupEntriesByDay, totalsByCurrency } from '../grouping'

/** Minimal EntryWithTags fixture — only the fields the grouping logic reads matter. */
function entry(over: Partial<EntryWithTags> & { occurredOn: string }): EntryWithTags {
  return {
    id: over.id ?? `${over.occurredOn}-${over.amountMinor ?? 0}-${Math.random()}`,
    title: over.title ?? 'Item',
    description: over.description ?? null,
    categoryId: over.categoryId ?? 'cat',
    amountMinor: over.amountMinor ?? -100,
    currency: over.currency ?? 'INR',
    occurredOn: over.occurredOn,
    createdAt: over.createdAt ?? 0,
    updatedAt: over.updatedAt ?? 0,
    deletedAt: over.deletedAt ?? null,
    tags: over.tags ?? [],
  }
}

describe('formatDayTitle (§6.6)', () => {
  it('labels today and yesterday relatively', () => {
    expect(formatDayTitle('2026-07-05', '2026-07-05')).toBe('Today')
    expect(formatDayTitle('2026-07-04', '2026-07-05')).toBe('Yesterday')
  })

  it('formats other same-year days as a short weekday/month/day label (no year)', () => {
    // 2026-07-01 is a Wednesday; same year as `todayIso`, so the year is omitted.
    expect(formatDayTitle('2026-07-01', '2026-07-05')).toBe('Wed, Jul 1')
  })

  it('appends the year for a date outside the current year', () => {
    // Imported prior-year rows must not be mistaken for the current year (§6.6).
    expect(formatDayTitle('2025-07-01', '2026-07-05')).toBe('Tue, Jul 1, 2025')
    expect(formatDayTitle('2027-01-02', '2026-07-05')).toBe('Sat, Jan 2, 2027')
  })

  it('does not shift across timezones (parses from calendar parts)', () => {
    // A date with no relative context still renders its own calendar day, never ±1.
    // Pinned to a same-year `todayIso` so the label stays deterministic across clock years.
    expect(formatDayTitle('2026-01-01', '2026-07-05')).toBe('Thu, Jan 1')
  })
})

describe('totalsByCurrency (§6.3)', () => {
  it('sums signed amounts per currency and never mixes currencies', () => {
    const totals = totalsByCurrency([
      entry({ occurredOn: '2026-07-04', amountMinor: -1200, currency: 'INR' }),
      entry({ occurredOn: '2026-07-04', amountMinor: -300, currency: 'INR' }),
      entry({ occurredOn: '2026-07-04', amountMinor: 500, currency: 'USD' }),
    ])
    expect(totals).toEqual([
      { currency: 'INR', net: -1500 },
      { currency: 'USD', net: 500 },
    ])
  })
})

describe('groupEntriesByDay (§8 Phase 4)', () => {
  it('groups consecutive same-day entries and computes per-day totals, preserving order', () => {
    const entries = [
      entry({ id: 'a', occurredOn: '2026-07-05', amountMinor: -1000 }),
      entry({ id: 'b', occurredOn: '2026-07-05', amountMinor: -400 }),
      entry({ id: 'c', occurredOn: '2026-07-03', amountMinor: 250 }),
    ]
    const sections = groupEntriesByDay(entries, '2026-07-05')
    expect(sections).toHaveLength(2)

    expect(sections[0].date).toBe('2026-07-05')
    expect(sections[0].title).toBe('Today')
    expect(sections[0].data.map((e) => e.id)).toEqual(['a', 'b'])
    expect(sections[0].totals).toEqual([{ currency: 'INR', net: -1400 }])

    expect(sections[1].date).toBe('2026-07-03')
    expect(sections[1].totals).toEqual([{ currency: 'INR', net: 250 }])
  })

  it('returns no sections for an empty ledger', () => {
    expect(groupEntriesByDay([])).toEqual([])
  })
})
