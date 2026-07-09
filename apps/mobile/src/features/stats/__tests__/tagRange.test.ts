import { resolveRange } from '../TagRangeTotal'

/** The date-range presets for the custom tag total resolve relative to "today" (§8 Phase 6). */
describe('resolveRange', () => {
  const today = '2026-07-10'

  it('This month → the calendar month containing today', () => {
    expect(resolveRange('month', today)).toEqual({ from: '2026-07-01', to: '2026-07-31' })
  })
  it('Last 3 months → the trailing 3 calendar months', () => {
    expect(resolveRange('3months', today)).toEqual({ from: '2026-05-01', to: '2026-07-31' })
  })
  it('This year → Jan 1 to Dec 31 of the current year', () => {
    expect(resolveRange('year', today)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })
  it('All time → an open-ended range', () => {
    expect(resolveRange('all', today)).toEqual({})
  })
})
