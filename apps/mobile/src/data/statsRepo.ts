/**
 * Stats / dashboard aggregation repository (§7.6, §8 Phase 6).
 *
 * Framework-agnostic (injected {@link AppDatabase}), like every other repo. Owns the grouped
 * sums the dashboard needs: this-month summary, a trailing monthly spend series, a by-category
 * breakdown, and a custom total-by-tags-in-a-date-range query. Aggregation is expressed with
 * raw `sql` templates (over the schema's column refs) because GROUP BY `substr(occurred_on,1,7)`
 * and conditional debit/credit sums are cleaner than the Drizzle query builder can express.
 *
 * Two invariants hold across EVERY query here:
 *  - Soft-deleted rows (`deleted_at IS NOT NULL`) are always excluded (§6.7).
 *  - The MIXED-CURRENCY rule (§8 Phase 6): sums include ONLY the default currency. Entries in
 *    another currency are never summed in; instead each aggregate reports `otherCurrencyCount`
 *    — the number of non-default-currency entries in the SAME scope — so the UI can show an
 *    "n entries in other currencies excluded" badge. There is NO conversion in the MVP.
 *
 * Money stays in SIGNED minor units end-to-end (§6.1): `debitMinor` is the (<= 0) sum of
 * debits, `creditMinor` the (>= 0) sum of credits, `net = debitMinor + creditMinor`.
 */
import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'

import { normalizeCurrency } from '@/domain/money'
import { normalizeTag } from '@/domain/tags'
import { lastNMonths } from '@/domain/dates'
import { entryTags, ledgerEntries } from '@/db/schema'
import type { AppDatabase } from '@/db/types'

/** A signed money aggregate over some scope, plus the mixed-currency exclusion count. */
export type AmountAggregate = {
  /** Sum of debit amounts (money out) as a non-positive integer of minor units (§6.1). */
  debitMinor: number
  /** Sum of credit amounts (money in) as a non-negative integer of minor units (§6.1). */
  creditMinor: number
  /** Net = `debitMinor + creditMinor` (signed). */
  net: number
  /** Number of DEFAULT-currency, non-deleted entries counted into the sums. */
  count: number
  /**
   * Number of NON-default-currency, non-deleted entries in the SAME scope — excluded from the
   * sums (§8 Phase 6). Drives the "n entries in other currencies excluded" badge. Always >= 0.
   */
  otherCurrencyCount: number
}

/** One month bucket of the trailing spend series. `month` is `YYYY-MM`. */
export type MonthlyAggregate = AmountAggregate & { month: string }

/** One category's slice of a by-category breakdown. */
export type CategoryAggregate = AmountAggregate & { categoryId: string }

/** Raw row shape from the single-pass aggregate SQL (values arrive as numbers from SQLite). */
type AggregateRow = {
  debitMinor: number
  creditMinor: number
  net: number
  count: number
  otherCurrencyCount: number
}

const ZERO: AmountAggregate = {
  debitMinor: 0,
  creditMinor: 0,
  net: 0,
  count: 0,
  otherCurrencyCount: 0,
}

/** Coerce a raw SQL aggregate row (SUM/COUNT can be null on empty sets) to numbers. */
function coerce(row: AggregateRow | undefined): AmountAggregate {
  if (!row) return { ...ZERO }
  return {
    debitMinor: Number(row.debitMinor) || 0,
    creditMinor: Number(row.creditMinor) || 0,
    net: Number(row.net) || 0,
    count: Number(row.count) || 0,
    otherCurrencyCount: Number(row.otherCurrencyCount) || 0,
  }
}

/**
 * The single-pass aggregate SELECT list: default-currency debit/credit/net/count PLUS the
 * non-default-currency exclusion count, all in one scan. `cur` must already be normalised.
 * Callers append their own `FROM ... WHERE ...` (and optional GROUP BY).
 */
function aggregateColumns(cur: string) {
  const isDefault = sql`${ledgerEntries.currency} = ${cur}`
  return sql`
    COALESCE(SUM(CASE WHEN ${isDefault} AND ${ledgerEntries.amountMinor} < 0 THEN ${ledgerEntries.amountMinor} ELSE 0 END), 0) AS "debitMinor",
    COALESCE(SUM(CASE WHEN ${isDefault} AND ${ledgerEntries.amountMinor} > 0 THEN ${ledgerEntries.amountMinor} ELSE 0 END), 0) AS "creditMinor",
    COALESCE(SUM(CASE WHEN ${isDefault} THEN ${ledgerEntries.amountMinor} ELSE 0 END), 0) AS "net",
    COALESCE(SUM(CASE WHEN ${isDefault} THEN 1 ELSE 0 END), 0) AS "count",
    COALESCE(SUM(CASE WHEN ${ledgerEntries.currency} <> ${cur} THEN 1 ELSE 0 END), 0) AS "otherCurrencyCount"
  `
}

/** `deleted_at IS NULL AND <extra>` — the always-on soft-delete guard plus scope conditions. */
function scopeWhere(extra?: ReturnType<typeof and>) {
  return extra ? and(isNull(ledgerEntries.deletedAt), extra) : isNull(ledgerEntries.deletedAt)
}

/** Inclusive `occurred_on` date-range condition (both bounds optional). */
function dateRangeCondition(from?: string, to?: string) {
  const parts = []
  if (from) parts.push(gte(ledgerEntries.occurredOn, from))
  if (to) parts.push(lte(ledgerEntries.occurredOn, to))
  return parts.length > 0 ? and(...parts) : undefined
}

/** Run the single-pass aggregate over `deleted_at IS NULL AND <scope>` and coerce the row. */
function aggregate(db: AppDatabase, cur: string, scope?: ReturnType<typeof and>): AmountAggregate {
  const row = db.get<AggregateRow>(
    sql`SELECT ${aggregateColumns(cur)} FROM ${ledgerEntries} WHERE ${scopeWhere(scope)}`
  )
  return coerce(row)
}

export type CurrencyOption = {
  /** Default currency to aggregate (from `app_settings`). Normalised internally. */
  currency: string
}

export type MonthSummaryOptions = CurrencyOption & {
  /** The `YYYY-MM` month to summarise. */
  month: string
}

/**
 * Summary for a single `YYYY-MM` month (the dashboard's summary cards, §7.6): total debit,
 * total credit, net, entry count — default currency only — plus the other-currency count.
 */
export function monthSummary(db: AppDatabase, options: MonthSummaryOptions): AmountAggregate {
  const cur = normalizeCurrency(options.currency)
  const monthCondition = eq(sql`substr(${ledgerEntries.occurredOn}, 1, 7)`, options.month)
  return aggregate(db, cur, and(monthCondition))
}

export type MonthlySeriesOptions = CurrencyOption & {
  /** Inclusive `YYYY-MM` end of the window (default: the latest month is caller's concern). */
  endMonth: string
  /** How many trailing months to return (default 6 — see {@link DEFAULT_SERIES_MONTHS}). */
  months?: number
}

/**
 * Trailing monthly spend series ending at `endMonth`, oldest-first, ZERO-FILLED so every month
 * in the window appears even with no entries (a continuous bar-chart x-axis, §8 Phase 6).
 * Each bucket carries the default-currency debit/credit/net/count and its own
 * `otherCurrencyCount`. Default window = 6 months: enough to read a half-year trend while
 * still fitting a phone screen without crowding the bars/labels.
 */
export function monthlySpendSeries(
  db: AppDatabase,
  options: MonthlySeriesOptions
): MonthlyAggregate[] {
  const cur = normalizeCurrency(options.currency)
  const count = options.months ?? DEFAULT_SERIES_MONTHS
  const window = lastNMonths(options.endMonth, count)
  const start = window[0]
  const end = window[window.length - 1]

  const monthExpr = sql`substr(${ledgerEntries.occurredOn}, 1, 7)`
  const scope = and(gte(monthExpr, start), lte(monthExpr, end))
  const rows = db.all<AggregateRow & { month: string }>(
    sql`SELECT ${monthExpr} AS "month", ${aggregateColumns(cur)}
          FROM ${ledgerEntries}
          WHERE ${scopeWhere(scope)}
          GROUP BY ${monthExpr}`
  )

  const byMonth = new Map(rows.map((r) => [r.month, coerce(r)]))
  return window.map((month) => ({ month, ...(byMonth.get(month) ?? { ...ZERO }) }))
}

/** Default trailing window for the monthly bar chart (§8 Phase 6). */
export const DEFAULT_SERIES_MONTHS = 6

export type CategoryBreakdownOptions = CurrencyOption & {
  /** Inclusive `YYYY-MM-DD` range start (optional → open-ended = all history). */
  from?: string
  /** Inclusive `YYYY-MM-DD` range end (optional). */
  to?: string
}

export type CategoryBreakdown = {
  /** Per-category default-currency aggregates, ordered by spend (largest debit first). */
  categories: CategoryAggregate[]
  /** Non-default-currency entries in the range, excluded from every row (badge, §8 Phase 6). */
  otherCurrencyCount: number
}

/**
 * Spend grouped by category over an optional date range (§8 Phase 6). Rows are DEFAULT-currency
 * only and ordered by debit magnitude (largest spend first) so the UI can render a ranked
 * breakdown / pie without re-sorting. The range-level `otherCurrencyCount` (across all
 * categories) drives the excluded badge. Category NAMES/colours are resolved by the caller via
 * `categoriesRepo.getById` (which resolves deactivated categories on old entries too, §6.4).
 */
export function categoryBreakdown(
  db: AppDatabase,
  options: CategoryBreakdownOptions
): CategoryBreakdown {
  const cur = normalizeCurrency(options.currency)
  const range = dateRangeCondition(options.from, options.to)

  // Per-category rows: DEFAULT currency only (a category present solely in another currency
  // must NOT appear as an empty slice) — the exclusion is surfaced via the count below.
  const rows = db.all<{
    categoryId: string
    debitMinor: number
    creditMinor: number
    net: number
    count: number
  }>(
    sql`SELECT ${ledgerEntries.categoryId} AS "categoryId",
            COALESCE(SUM(CASE WHEN ${ledgerEntries.amountMinor} < 0 THEN ${ledgerEntries.amountMinor} ELSE 0 END), 0) AS "debitMinor",
            COALESCE(SUM(CASE WHEN ${ledgerEntries.amountMinor} > 0 THEN ${ledgerEntries.amountMinor} ELSE 0 END), 0) AS "creditMinor",
            COALESCE(SUM(${ledgerEntries.amountMinor}), 0) AS "net",
            COUNT(*) AS "count"
          FROM ${ledgerEntries}
          WHERE ${scopeWhere(and(eq(ledgerEntries.currency, cur), range))}
          GROUP BY ${ledgerEntries.categoryId}
          ORDER BY "debitMinor" ASC`
  )

  const categories: CategoryAggregate[] = rows.map((r) => ({
    categoryId: r.categoryId,
    debitMinor: Number(r.debitMinor) || 0,
    creditMinor: Number(r.creditMinor) || 0,
    net: Number(r.net) || 0,
    count: Number(r.count) || 0,
    otherCurrencyCount: 0,
  }))

  // Range-level exclusion count (all non-default-currency entries in the range).
  const excluded = db.get<{ otherCurrencyCount: number }>(
    sql`SELECT COALESCE(COUNT(*), 0) AS "otherCurrencyCount"
          FROM ${ledgerEntries}
          WHERE ${scopeWhere(and(sql`${ledgerEntries.currency} <> ${cur}`, range))}`
  )
  return { categories, otherCurrencyCount: Number(excluded?.otherCurrencyCount) || 0 }
}

export type TagRangeTotalOptions = CurrencyOption & {
  /** Tags to match with AND semantics — an entry counts only if it has ALL of them (§6.3). */
  tags: readonly string[]
  /** Inclusive `YYYY-MM-DD` range start (optional). */
  from?: string
  /** Inclusive `YYYY-MM-DD` range end (optional). */
  to?: string
}

/**
 * Total for entries matching ALL of `tags` (multi-tag AND, §6.3 — the same semantics as
 * `listEntries`) within an optional date range, default currency only (§8 Phase 6). An empty
 * tag list matches nothing (returns a zero aggregate) — the custom query is meaningless without
 * at least one tag. Reuses the established tag-AND subquery for consistency with the ledger.
 */
export function tagRangeTotal(db: AppDatabase, options: TagRangeTotalOptions): AmountAggregate {
  const cur = normalizeCurrency(options.currency)
  const filterTags = dedupeNormalized(options.tags)
  if (filterTags.length === 0) return { ...ZERO }

  // Entries having ALL requested tags: same pattern as listEntries (§6.3).
  const matchingIds = db
    .select({ id: entryTags.entryId })
    .from(entryTags)
    .where(inArray(entryTags.tag, filterTags))
    .groupBy(entryTags.entryId)
    .having(sql`count(distinct ${entryTags.tag}) = ${filterTags.length}`)

  const scope = and(
    inArray(ledgerEntries.id, matchingIds),
    dateRangeCondition(options.from, options.to)
  )
  return aggregate(db, cur, scope)
}

/** Normalise + dedupe tags without throwing (mirrors listEntries' filter handling). */
function dedupeNormalized(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const raw of tags) {
    const t = normalizeTag(raw)
    if (t.length > 0) seen.add(t)
  }
  return [...seen]
}

/** Grouped export mirroring the other repos' naming (§4). */
export const statsRepo = {
  monthSummary,
  monthlySpendSeries,
  categoryBreakdown,
  tagRangeTotal,
}
