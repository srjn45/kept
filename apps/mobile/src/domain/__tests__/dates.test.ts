import {
  currentMonth,
  isValidISODate,
  lastNMonths,
  monthEndDate,
  monthOf,
  monthStartDate,
  shiftMonth,
  toISODate,
  todayISO,
} from '@/domain'

describe('date helpers (§6.6)', () => {
  it('formats a Date to YYYY-MM-DD using local fields', () => {
    expect(toISODate(new Date(2026, 6, 4))).toBe('2026-07-04') // month is 0-indexed
    expect(toISODate(new Date(2026, 0, 9))).toBe('2026-01-09') // zero-padded
  })
  it('todayISO uses the provided clock', () => {
    expect(todayISO(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
  it('validates real calendar dates and rejects impossible ones', () => {
    expect(isValidISODate('2026-07-04')).toBe(true)
    expect(isValidISODate('2024-02-29')).toBe(true) // leap year
    expect(isValidISODate('2026-02-30')).toBe(false)
    expect(isValidISODate('2026-13-01')).toBe(false)
    expect(isValidISODate('2026-7-4')).toBe(false) // not zero-padded
    expect(isValidISODate('not-a-date')).toBe(false)
  })
  it('buckets by YYYY-MM month', () => {
    expect(monthOf('2026-07-04')).toBe('2026-07')
  })

  describe('month arithmetic (§7.6 stats)', () => {
    it('currentMonth reads the provided clock', () => {
      expect(currentMonth(new Date(2026, 6, 10))).toBe('2026-07')
    })
    it('shiftMonth moves across year boundaries in both directions', () => {
      expect(shiftMonth('2026-07', -1)).toBe('2026-06')
      expect(shiftMonth('2026-01', -1)).toBe('2025-12')
      expect(shiftMonth('2026-12', 1)).toBe('2027-01')
      expect(shiftMonth('2026-07', -13)).toBe('2025-06')
    })
    it('lastNMonths returns the trailing window oldest-first, inclusive of the end', () => {
      expect(lastNMonths('2026-07', 6)).toEqual([
        '2026-02',
        '2026-03',
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
      ])
      expect(lastNMonths('2026-01', 3)).toEqual(['2025-11', '2025-12', '2026-01'])
    })
    it('monthStartDate / monthEndDate give the inclusive calendar bounds (leap-aware)', () => {
      expect(monthStartDate('2026-07')).toBe('2026-07-01')
      expect(monthEndDate('2026-07')).toBe('2026-07-31')
      expect(monthEndDate('2026-02')).toBe('2026-02-28')
      expect(monthEndDate('2024-02')).toBe('2024-02-29') // leap year
      expect(monthEndDate('2026-04')).toBe('2026-04-30')
    })
  })
})
