import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { EmptyState } from '@/components'
import {
  categoryBreakdown,
  getCategoryById,
  monthlySpendSeries,
  monthSummary,
  type AppDatabase,
} from '@/data'
import { monthEndDate, monthOf, monthStartDate, shiftMonth } from '@/domain'

import { CategoryBreakdown } from './CategoryBreakdown'
import { ExcludedBadge } from './ExcludedBadge'
import { MonthlyBarChart } from './MonthlyBarChart'
import { SummaryCards } from './SummaryCards'
import { TagRangeTotal } from './TagRangeTotal'
import { fullMonthLabel, toCategorySlices, toMonthlyBars } from './statsView'

export type StatsManagerProps = {
  /** Injected DB (production `getDatabase()`; tests inject in-memory better-sqlite3). */
  db: AppDatabase
  /** Default currency to aggregate — mixed-currency entries are excluded (§8 Phase 6). */
  currency: string
  /** Today as `YYYY-MM-DD`, so the default month + presets are deterministic (testable). */
  today: string
  /** Whether there are any (non-deleted) entries at all — drives the first-run empty state. */
  hasAnyEntries: boolean
  /** Navigate to the ledger to add the first expense (from the empty state). */
  onOpenLedger?: () => void
}

/**
 * The stats dashboard (§7.6 · Phase 6). Pure and DB-injected (imports NO expo-sqlite; the route
 * wrapper owns `getDatabase` + the reactive signal), so the whole screen runs under Jest against
 * a real in-memory database. Reads its aggregates straight from {@link statsRepo} on every
 * render — a month selector drives the summary cards + category breakdown; a trailing bar chart
 * shows the spend trend; and a custom total-by-tags tool sits below. Every aggregate is default-
 * currency only, with an "excluded" badge wherever other-currency entries were left out.
 */
export function StatsManager({
  db,
  currency,
  today,
  hasAnyEntries,
  onOpenLedger,
}: StatsManagerProps) {
  const currentMonth = monthOf(today)
  const [month, setMonth] = useState(currentMonth)

  // Read aggregates for the selected month + the trailing bar window. Direct reads (like the
  // ledger's category lookups); the route re-renders us on focus/DB-change so these stay fresh.
  const summary = useMemo(() => monthSummary(db, { currency, month }), [db, currency, month])
  const series = useMemo(
    () => monthlySpendSeries(db, { currency, endMonth: month }),
    [db, currency, month]
  )
  const breakdown = useMemo(
    () =>
      categoryBreakdown(db, {
        currency,
        from: monthStartDate(month),
        to: monthEndDate(month),
      }),
    [db, currency, month]
  )

  const bars = useMemo(() => toMonthlyBars(series, currency), [series, currency])
  const seriesExcluded = useMemo(
    () => series.reduce((sum, m) => sum + m.otherCurrencyCount, 0),
    [series]
  )
  const slices = useMemo(
    () =>
      toCategorySlices(breakdown.categories, (id) => {
        const category = getCategoryById(db, id)
        return { name: category?.name ?? 'Uncategorised', color: category?.color }
      }),
    [db, breakdown]
  )

  if (!hasAnyEntries) {
    return (
      <EmptyState
        title="Nothing to analyse yet"
        description="Add a few expenses and your spending stats — monthly trends, category breakdowns and tag totals — will appear here. Your data stays on your device."
        actionLabel="Add an expense"
        onAction={onOpenLedger}
        testID="stats-empty"
      />
    )
  }

  const canGoNext = month < currentMonth

  return (
    <View className="gap-4" testID="stats-manager">
      {/* Month selector */}
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => setMonth((m) => shiftMonth(m, -1))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          testID="stats-prev-month"
          className="rounded-button bg-surface-alt px-3 py-2"
        >
          <Text className="text-base text-fg">‹</Text>
        </Pressable>
        <Text className="text-lg font-semibold text-fg" testID="stats-month-label">
          {fullMonthLabel(month)}
        </Text>
        <Pressable
          onPress={() => canGoNext && setMonth((m) => shiftMonth(m, 1))}
          disabled={!canGoNext}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: !canGoNext }}
          testID="stats-next-month"
          className="rounded-button bg-surface-alt px-3 py-2"
          style={{ opacity: canGoNext ? 1 : 0.4 }}
        >
          <Text className="text-base text-fg">›</Text>
        </Pressable>
      </View>

      <SummaryCards summary={summary} currency={currency} testID="stats-summary" />
      <ExcludedBadge count={summary.otherCurrencyCount} testID="stats-summary-excluded" />

      <MonthlyBarChart
        bars={bars}
        currency={currency}
        highlightMonth={month}
        excludedCount={seriesExcluded}
        testID="stats-monthly"
      />

      <CategoryBreakdown
        slices={slices}
        currency={currency}
        excludedCount={breakdown.otherCurrencyCount}
        testID="stats-category"
      />

      <TagRangeTotal db={db} currency={currency} today={today} testID="stats-tag-range" />
    </View>
  )
}
