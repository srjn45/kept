import type { CategoryAggregate, MonthlyAggregate } from '@/data'

import {
  compactNumber,
  formatPercent,
  fullMonthLabel,
  niceMax,
  OTHER_SLICE_COLOR,
  shortMonthLabel,
  SLICE_FALLBACK_COLORS,
  toCategorySlices,
  toMonthlyBars,
} from '../statsView'

const month = (over: Partial<MonthlyAggregate> & { month: string }): MonthlyAggregate => ({
  debitMinor: 0,
  creditMinor: 0,
  net: 0,
  count: 0,
  otherCurrencyCount: 0,
  ...over,
})

const cat = (over: Partial<CategoryAggregate> & { categoryId: string }): CategoryAggregate => ({
  debitMinor: 0,
  creditMinor: 0,
  net: 0,
  count: 0,
  otherCurrencyCount: 0,
  ...over,
})

describe('statsView', () => {
  describe('month labels', () => {
    it('short label is the month name, with a year hint each January', () => {
      expect(shortMonthLabel('2026-07')).toBe('Jul')
      expect(shortMonthLabel('2026-01')).toBe("Jan '26")
    })
    it('full label is month + year', () => {
      expect(fullMonthLabel('2026-07')).toBe('July 2026')
    })
  })

  describe('toMonthlyBars', () => {
    it('maps spend magnitude to major units and keeps the raw minor amount', () => {
      const bars = toMonthlyBars(
        [
          month({ month: '2026-06', debitMinor: -1500, creditMinor: 400 }),
          month({ month: '2026-07' }),
        ],
        'INR'
      )
      expect(bars[0]).toMatchObject({ month: '2026-06', value: 15, spentMinor: 1500, label: 'Jun' })
      // Zero month keeps a zero bar so the axis stays continuous.
      expect(bars[1]).toMatchObject({ month: '2026-07', value: 0, spentMinor: 0 })
    })
    it('honours currency-aware minor units (JPY has 0 decimals)', () => {
      const bars = toMonthlyBars([month({ month: '2026-07', debitMinor: -1500 })], 'JPY')
      expect(bars[0].value).toBe(1500)
    })
  })

  describe('toCategorySlices', () => {
    const resolve = (id: string) => ({ name: id.toUpperCase(), color: null })

    it('ranks by spend, computes fractions, and omits credit-only categories', () => {
      const slices = toCategorySlices(
        [
          cat({ categoryId: 'food', debitMinor: -2500 }),
          cat({ categoryId: 'rent', debitMinor: -7500 }),
          cat({ categoryId: 'income', debitMinor: 0, creditMinor: 9000 }), // credit only → omitted
        ],
        resolve
      )
      expect(slices.map((s) => s.categoryId)).toEqual(['rent', 'food'])
      expect(slices.map((s) => s.spentMinor)).toEqual([7500, 2500])
      expect(slices[0].fraction).toBeCloseTo(0.75)
      expect(slices[1].fraction).toBeCloseTo(0.25)
    })

    it('uses fallback colors when a category has none, and the category color when present', () => {
      const slices = toCategorySlices([cat({ categoryId: 'a', debitMinor: -100 })], () => ({
        name: 'A',
        color: '#123456',
      }))
      expect(slices[0].color).toBe('#123456')

      const fallback = toCategorySlices([cat({ categoryId: 'a', debitMinor: -100 })], resolve)
      expect(fallback[0].color).toBe(SLICE_FALLBACK_COLORS[0])
    })

    it('aggregates everything beyond topN into a neutral "Other" slice', () => {
      const cats = Array.from({ length: 8 }, (_, i) =>
        cat({ categoryId: `c${i}`, debitMinor: -(100 - i) * 10 })
      )
      const slices = toCategorySlices(cats, resolve, { topN: 3 })
      expect(slices).toHaveLength(4) // 3 + Other
      const other = slices[slices.length - 1]
      expect(other.categoryId).toBeNull()
      expect(other.color).toBe(OTHER_SLICE_COLOR)
      expect(other.label).toContain('Other')
      // Fractions across all slices sum to ~1.
      expect(slices.reduce((sum, s) => sum + s.fraction, 0)).toBeCloseTo(1)
    })

    it('returns no slices when there is no spend', () => {
      expect(toCategorySlices([cat({ categoryId: 'x', creditMinor: 500 })], resolve)).toEqual([])
    })
  })

  describe('number formatting', () => {
    it('formatPercent rounds to whole percents', () => {
      expect(formatPercent(0.2345)).toBe('23%')
      expect(formatPercent(1)).toBe('100%')
    })
    it('niceMax rounds up to 1/2/5 × 10ⁿ', () => {
      expect(niceMax(0)).toBe(1)
      expect(niceMax(15)).toBe(20)
      expect(niceMax(1200)).toBe(2000)
      expect(niceMax(4300)).toBe(5000)
      expect(niceMax(50)).toBe(50)
    })
    it('compactNumber abbreviates thousands/millions', () => {
      expect(compactNumber(950)).toBe('950')
      expect(compactNumber(1500)).toBe('1.5k')
      expect(compactNumber(2_000_000)).toBe('2M')
    })
  })
})
