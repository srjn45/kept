import { useMemo } from 'react'
import { Text, View } from 'react-native'
import { PieChart } from 'react-native-gifted-charts'

import { AmountText, Card } from '@/components'
import { useThemeColors } from '@/theme/useThemeColors'

import { ExcludedBadge } from './ExcludedBadge'
import { formatPercent, type CategorySlice } from './statsView'

export type CategoryBreakdownProps = {
  /** Ranked spend slices (from {@link toCategorySlices}), largest first. */
  slices: CategorySlice[]
  /** Default currency for the legend amounts. */
  currency: string
  /** Non-default-currency entries excluded from the breakdown (badge, §8 Phase 6). */
  excludedCount: number
  testID?: string
}

/**
 * By-category spend breakdown (§8 Phase 6) — a donut of each category's share plus a ranked
 * legend with exact amounts and percentages. DEFAULT currency only. Category colours flow from
 * the categories the user set (falling back to a deterministic palette); the legend carries the
 * name + amount so meaning never rests on colour alone (§7.7). Built on
 * `react-native-gifted-charts` (SVG → renders on web + native).
 */
export function CategoryBreakdown({
  slices,
  currency,
  excludedCount,
  testID,
}: CategoryBreakdownProps) {
  const colors = useThemeColors()
  const pieData = useMemo(
    () => slices.map((s) => ({ value: s.spentMinor, color: s.color })),
    [slices]
  )
  const hasSpend = slices.length > 0

  return (
    <Card testID={testID} className="gap-3">
      <Text className="text-base font-semibold text-fg">Spending by category</Text>

      {hasSpend ? (
        <>
          <View className="items-center py-2" testID="stats-category-chart">
            <PieChart
              data={pieData}
              donut
              radius={90}
              innerRadius={58}
              innerCircleColor={colors.surface}
              isAnimated={false}
            />
          </View>

          <View className="gap-2" testID="stats-category-legend">
            {slices.map((s) => (
              <View
                key={s.categoryId ?? '__other__'}
                className="flex-row items-center gap-2"
                testID={`stats-category-row-${s.categoryId ?? 'other'}`}
              >
                <View
                  style={{ width: 10, height: 10, borderRadius: 9999, backgroundColor: s.color }}
                />
                <Text className="flex-1 text-sm text-fg" numberOfLines={1}>
                  {s.label}
                </Text>
                <Text className="w-10 text-right text-xs text-muted">
                  {formatPercent(s.fraction)}
                </Text>
                <AmountText
                  amountMinor={-s.spentMinor}
                  currency={currency}
                  size="sm"
                  showSign={false}
                  colored={false}
                  testID={`stats-category-amount-${s.categoryId ?? 'other'}`}
                />
              </View>
            ))}
          </View>
        </>
      ) : (
        <Text className="py-6 text-center text-sm text-muted" testID="stats-category-empty">
          No spending to break down for this month.
        </Text>
      )}

      <ExcludedBadge count={excludedCount} testID="stats-category-excluded" />
    </Card>
  )
}
