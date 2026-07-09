import {
  categoryBreakdown,
  createCategory,
  createEntry,
  monthlySpendSeries,
  monthSummary,
  softDeleteEntry,
  tagRangeTotal,
} from '@/data'
import { createTestDatabase, type TestDatabase } from '@/db/__tests__/testDb'

/**
 * Aggregation-correctness tests for the Phase 6 stats repo (§8). They run against a REAL
 * in-memory better-sqlite3 database (§3 — no DB mocks), exercising the same SQL that ships.
 * The focus areas the DoD calls out: monthly bucketing, by-category grouping, tag-range
 * totals, and — critically — the mixed-currency exclusion (non-default currency excluded from
 * sums but counted for the badge) and soft-delete exclusion.
 */
describe('statsRepo (§8 Phase 6)', () => {
  let h: TestDatabase
  let food: string
  let transport: string
  beforeEach(() => {
    h = createTestDatabase()
    food = createCategory(h.db, { name: 'Food' }).id
    transport = createCategory(h.db, { name: 'Transport' }).id
  })
  afterEach(() => h.close())

  const entry = (over: Partial<Parameters<typeof createEntry>[1]> = {}) =>
    createEntry(h.db, {
      title: 'x',
      categoryId: food,
      amountMinor: -1000,
      currency: 'INR',
      occurredOn: '2026-07-04',
      tags: [],
      ...over,
    })

  describe('monthSummary', () => {
    it('splits debit/credit/net/count for the default currency in one month', () => {
      entry({ amountMinor: -1200, occurredOn: '2026-07-04' })
      entry({ amountMinor: -800, occurredOn: '2026-07-20' })
      entry({ amountMinor: 500, occurredOn: '2026-07-10' }) // credit (refund)
      entry({ amountMinor: -9999, occurredOn: '2026-06-30' }) // different month → excluded

      const s = monthSummary(h.db, { currency: 'INR', month: '2026-07' })
      expect(s.debitMinor).toBe(-2000)
      expect(s.creditMinor).toBe(500)
      expect(s.net).toBe(-1500)
      expect(s.count).toBe(3)
      expect(s.otherCurrencyCount).toBe(0)
    })

    it('excludes soft-deleted entries (§6.7)', () => {
      const keep = entry({ amountMinor: -1000 })
      const gone = entry({ amountMinor: -5000 })
      softDeleteEntry(h.db, gone.id)
      const s = monthSummary(h.db, { currency: 'INR', month: '2026-07' })
      expect(s.debitMinor).toBe(-1000)
      expect(s.count).toBe(1)
      expect(keep.id).toBeDefined()
    })

    it('excludes non-default-currency entries from sums but counts them for the badge (§8)', () => {
      entry({ amountMinor: -1000, currency: 'INR' })
      entry({ amountMinor: -2000, currency: 'INR' })
      entry({ amountMinor: -9900, currency: 'USD' }) // other currency → excluded, counted
      entry({ amountMinor: -4200, currency: 'EUR' }) // other currency → excluded, counted

      const s = monthSummary(h.db, { currency: 'INR', month: '2026-07' })
      expect(s.debitMinor).toBe(-3000) // only the two INR debits
      expect(s.count).toBe(2)
      expect(s.otherCurrencyCount).toBe(2) // USD + EUR
    })

    it('normalises the requested currency (case-insensitive)', () => {
      entry({ amountMinor: -1000, currency: 'INR' })
      const s = monthSummary(h.db, { currency: 'inr', month: '2026-07' })
      expect(s.debitMinor).toBe(-1000)
      expect(s.otherCurrencyCount).toBe(0)
    })

    it('returns a zero aggregate for an empty month', () => {
      const s = monthSummary(h.db, { currency: 'INR', month: '2020-01' })
      expect(s).toEqual({ debitMinor: 0, creditMinor: 0, net: 0, count: 0, otherCurrencyCount: 0 })
    })
  })

  describe('monthlySpendSeries', () => {
    it('buckets by month and zero-fills gaps across the trailing window', () => {
      entry({ amountMinor: -1000, occurredOn: '2026-05-15' })
      entry({ amountMinor: -2000, occurredOn: '2026-07-01' })
      entry({ amountMinor: -3000, occurredOn: '2026-07-31' })

      const series = monthlySpendSeries(h.db, { currency: 'INR', endMonth: '2026-07', months: 3 })
      expect(series.map((m) => m.month)).toEqual(['2026-05', '2026-06', '2026-07'])
      expect(series.map((m) => m.debitMinor)).toEqual([-1000, 0, -5000])
      expect(series.map((m) => m.count)).toEqual([1, 0, 2])
    })

    it('defaults to a 6-month window', () => {
      const series = monthlySpendSeries(h.db, { currency: 'INR', endMonth: '2026-07' })
      expect(series).toHaveLength(6)
      expect(series[0].month).toBe('2026-02')
      expect(series[5].month).toBe('2026-07')
    })

    it('honours the mixed-currency rule per bucket', () => {
      entry({ amountMinor: -1000, currency: 'INR', occurredOn: '2026-07-02' })
      entry({ amountMinor: -7777, currency: 'USD', occurredOn: '2026-07-03' })

      const july = monthlySpendSeries(h.db, {
        currency: 'INR',
        endMonth: '2026-07',
        months: 1,
      })[0]
      expect(july.debitMinor).toBe(-1000)
      expect(july.otherCurrencyCount).toBe(1)
    })
  })

  describe('categoryBreakdown', () => {
    it('groups spend by category, largest spend first, resolving to categoryId', () => {
      entry({ categoryId: food, amountMinor: -500 })
      entry({ categoryId: food, amountMinor: -700 })
      entry({ categoryId: transport, amountMinor: -3000 })

      const { categories, otherCurrencyCount } = categoryBreakdown(h.db, { currency: 'INR' })
      expect(otherCurrencyCount).toBe(0)
      // Transport spends more (−3000) than Food (−1200) → transport ranks first.
      expect(categories.map((c) => c.categoryId)).toEqual([transport, food])
      expect(categories[0].debitMinor).toBe(-3000)
      expect(categories[1].debitMinor).toBe(-1200)
      expect(categories[1].count).toBe(2)
    })

    it('restricts to an inclusive date range', () => {
      entry({ categoryId: food, amountMinor: -100, occurredOn: '2026-06-30' })
      entry({ categoryId: food, amountMinor: -200, occurredOn: '2026-07-01' })
      entry({ categoryId: food, amountMinor: -400, occurredOn: '2026-07-31' })
      entry({ categoryId: food, amountMinor: -800, occurredOn: '2026-08-01' })

      const { categories } = categoryBreakdown(h.db, {
        currency: 'INR',
        from: '2026-07-01',
        to: '2026-07-31',
      })
      expect(categories).toHaveLength(1)
      expect(categories[0].debitMinor).toBe(-600) // only the two July entries
    })

    it('omits categories that exist only in another currency but counts them in the badge', () => {
      entry({ categoryId: food, amountMinor: -500, currency: 'INR' })
      entry({ categoryId: transport, amountMinor: -9900, currency: 'USD' }) // only other-currency

      const { categories, otherCurrencyCount } = categoryBreakdown(h.db, { currency: 'INR' })
      expect(categories.map((c) => c.categoryId)).toEqual([food])
      expect(otherCurrencyCount).toBe(1)
    })
  })

  describe('tagRangeTotal', () => {
    beforeEach(() => {
      entry({ amountMinor: -1000, tags: ['coffee', 'work'], occurredOn: '2026-07-05' })
      entry({ amountMinor: -2000, tags: ['coffee', 'work'], occurredOn: '2026-07-20' })
      entry({ amountMinor: -3000, tags: ['coffee'], occurredOn: '2026-07-06' }) // missing 'work'
      entry({ amountMinor: -4000, tags: ['work'], occurredOn: '2026-07-07' }) // missing 'coffee'
    })

    it('totals only entries carrying ALL tags (multi-tag AND, §6.3)', () => {
      const t = tagRangeTotal(h.db, { currency: 'INR', tags: ['coffee', 'work'] })
      expect(t.debitMinor).toBe(-3000) // the two entries with both tags
      expect(t.count).toBe(2)
    })

    it('applies a date range on top of the tag AND', () => {
      const t = tagRangeTotal(h.db, {
        currency: 'INR',
        tags: ['coffee', 'work'],
        from: '2026-07-01',
        to: '2026-07-10',
      })
      expect(t.debitMinor).toBe(-1000) // only the Jul-05 entry falls in range
      expect(t.count).toBe(1)
    })

    it('returns a zero aggregate for an empty tag list', () => {
      const t = tagRangeTotal(h.db, { currency: 'INR', tags: [] })
      expect(t).toEqual({ debitMinor: 0, creditMinor: 0, net: 0, count: 0, otherCurrencyCount: 0 })
    })

    it('excludes other-currency matches from the sum but counts them', () => {
      entry({
        amountMinor: -5000,
        tags: ['coffee', 'work'],
        currency: 'USD',
        occurredOn: '2026-07-09',
      })
      const t = tagRangeTotal(h.db, { currency: 'INR', tags: ['coffee', 'work'] })
      expect(t.debitMinor).toBe(-3000) // USD match excluded from the sum
      expect(t.count).toBe(2)
      expect(t.otherCurrencyCount).toBe(1)
    })

    it('normalises filter tags (case-insensitive)', () => {
      const t = tagRangeTotal(h.db, { currency: 'INR', tags: ['COFFEE', 'Work'] })
      expect(t.count).toBe(2)
    })
  })
})
