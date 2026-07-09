/**
 * Pure view-model helpers for the stats dashboard (§7.6 · Phase 6).
 *
 * These turn the repo's signed-minor-unit aggregates into the numbers the chart primitives and
 * legend want — bar heights, pie slices (top-N + "Other"), labels, percentages — with ZERO
 * React/RN imports, so the mapping is unit-testable in isolation. Money stays in minor units
 * until the very last step; magnitudes for spend are the ABS of the (<= 0) `debitMinor` (§6.1).
 */
import { minorUnitFactor } from '@/domain/money'
import type { CategoryAggregate, MonthlyAggregate } from '@/data'

/** Short month label from a `YYYY-MM` bucket, e.g. `2026-07` → "Jul" ("Jan" adds the year). */
export function shortMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const date = new Date(y, m - 1, 1)
  try {
    const mon = new Intl.DateTimeFormat('en', { month: 'short' }).format(date)
    // Anchor the window's year at each January so a cross-year window stays legible.
    return m === 1 ? `${mon} '${String(y).slice(-2)}` : mon
  } catch {
    return month
  }
}

/** Full month label from a `YYYY-MM` bucket, e.g. `2026-07` → "July 2026". */
export function fullMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const date = new Date(y, m - 1, 1)
  try {
    return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(date)
  } catch {
    return month
  }
}

/** Spend magnitude (a non-negative number of minor units) from a signed aggregate. */
export function spentMinor(agg: { debitMinor: number }): number {
  return Math.abs(agg.debitMinor)
}

export type MonthlyBar = {
  /** Spend magnitude in MAJOR units (what the bar height / y-axis reflects). */
  value: number
  /** Short x-axis label. */
  label: string
  /** The `YYYY-MM` bucket (for keys / highlight comparison). */
  month: string
  /** Raw spend magnitude in minor units (for exact formatting in a top label). */
  spentMinor: number
}

/**
 * Map a trailing monthly series to bar-chart rows (oldest-first, gaps already zero-filled by
 * the repo). Bar `value` is in MAJOR units so the chart's y-axis reads in the currency's whole
 * units; `spentMinor` is kept for exact-amount top labels.
 */
export function toMonthlyBars(series: readonly MonthlyAggregate[], currency: string): MonthlyBar[] {
  const factor = minorUnitFactor(currency)
  return series.map((m) => {
    const spent = spentMinor(m)
    return {
      value: spent / factor,
      label: shortMonthLabel(m.month),
      month: m.month,
      spentMinor: spent,
    }
  })
}

export type CategorySlice = {
  /** Category id, or `null` for the aggregated "Other" bucket. */
  categoryId: string | null
  /** Display name (resolved by the caller; "Other" for the bucket). */
  label: string
  /** Slice color (hex). */
  color: string
  /** Spend magnitude in minor units. */
  spentMinor: number
  /** Share of total spend in [0, 1]. */
  fraction: number
}

export type CategoryLabelResolver = (categoryId: string) => { name: string; color?: string | null }

/** Fallback slice colors for categories without a colour (deterministic by rank). */
export const SLICE_FALLBACK_COLORS = [
  '#6366F1',
  '#F59E0B',
  '#10B981',
  '#EF4444',
  '#3B82F6',
  '#EC4899',
  '#14B8A6',
  '#8B5CF6',
]

/** Neutral colour for the aggregated "Other" slice. */
export const OTHER_SLICE_COLOR = '#94A3B8'

export type PieOptions = {
  /** Max distinct category slices before the rest roll into "Other". Default 6. */
  topN?: number
}

/**
 * Build the by-category spend breakdown into pie slices + a ranked legend (§8 Phase 6).
 * Only categories with actual SPEND (a negative `debitMinor`) appear — a credit-only category
 * (e.g. Income) contributes no spend and is omitted. Slices are ordered largest-first; anything
 * beyond `topN` is aggregated into a single neutral "Other" slice. Fractions are shares of the
 * TOTAL spend shown (so they always sum to ~1 when spend exists).
 */
export function toCategorySlices(
  categories: readonly CategoryAggregate[],
  resolve: CategoryLabelResolver,
  options: PieOptions = {}
): CategorySlice[] {
  const topN = options.topN ?? 6
  const spends = categories
    .map((c) => ({ categoryId: c.categoryId, spent: spentMinor(c) }))
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.spent - a.spent)

  const total = spends.reduce((sum, c) => sum + c.spent, 0)
  if (total === 0) return []

  const head = spends.slice(0, topN)
  const tail = spends.slice(topN)

  const slices: CategorySlice[] = head.map((c, i) => {
    const meta = resolve(c.categoryId)
    return {
      categoryId: c.categoryId,
      label: meta.name,
      color: meta.color ?? SLICE_FALLBACK_COLORS[i % SLICE_FALLBACK_COLORS.length],
      spentMinor: c.spent,
      fraction: c.spent / total,
    }
  })

  if (tail.length > 0) {
    const otherSpent = tail.reduce((sum, c) => sum + c.spent, 0)
    slices.push({
      categoryId: null,
      label: `Other (${tail.length})`,
      color: OTHER_SLICE_COLOR,
      spentMinor: otherSpent,
      fraction: otherSpent / total,
    })
  }

  return slices
}

/** Format a fraction in [0,1] as a whole-percent string, e.g. 0.234 → "23%". */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

/**
 * Round a positive value UP to a "nice" axis maximum (1/2/5 × 10ⁿ) so a 5-section y-axis lands
 * on clean integer steps. Returns 1 for non-positive input (an all-zero chart still has an axis).
 */
export function niceMax(value: number): number {
  if (value <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(value))
  const norm = value / pow
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return nice * pow
}

/** Compact number for a y-axis tick, e.g. 1500 → "1.5k", 2_000_000 → "2M". */
export function compactNumber(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${trimZero(value / 1_000_000)}M`
  if (abs >= 1_000) return `${trimZero(value / 1_000)}k`
  return String(Math.round(value))
}

function trimZero(n: number): string {
  return Number(n.toFixed(1)).toString()
}
