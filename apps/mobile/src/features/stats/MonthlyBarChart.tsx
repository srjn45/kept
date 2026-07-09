import { useMemo } from 'react'
import { Text, View } from 'react-native'
import { BarChart } from 'react-native-gifted-charts'

import { Card } from '@/components'
import { formatMinor } from '@/domain'
import { useThemeColors } from '@/theme/useThemeColors'

import { ExcludedBadge } from './ExcludedBadge'
import { compactNumber, niceMax, type MonthlyBar } from './statsView'

const NO_OF_SECTIONS = 5

export type MonthlyBarChartProps = {
  /** Trailing monthly spend bars, oldest-first (from {@link toMonthlyBars}). */
  bars: MonthlyBar[]
  /** Default currency (for the y-axis + exact tooltip labels). */
  currency: string
  /** The `YYYY-MM` bucket to highlight (usually the selected month). */
  highlightMonth?: string
  /** Non-default-currency entries excluded across the window (badge, §8 Phase 6). */
  excludedCount: number
  testID?: string
}

/**
 * Monthly spend bar chart (§8 Phase 6) — spend (debit magnitude) per month over the trailing
 * window, DEFAULT currency only. Built on `react-native-gifted-charts` (SVG via
 * react-native-web, so it renders on web and native alike). The highlighted month is the accent
 * color; earlier months are a lighter tint. Animation is off to respect "reduce motion" (§7.7)
 * and keep rendering deterministic.
 */
export function MonthlyBarChart({
  bars,
  currency,
  highlightMonth,
  excludedCount,
  testID,
}: MonthlyBarChartProps) {
  const colors = useThemeColors()

  const maxValue = useMemo(() => niceMax(Math.max(0, ...bars.map((b) => b.value))), [bars])
  const hasSpend = bars.some((b) => b.spentMinor > 0)

  const data = useMemo(
    () =>
      bars.map((b) => ({
        value: b.value,
        label: b.label,
        // Highlighted month = full accent; others = a lighter accent tint.
        frontColor: b.month === highlightMonth ? colors.primary : `${colors.primary}80`,
        labelTextStyle: { color: colors.muted, fontSize: 10 },
      })),
    [bars, highlightMonth, colors.primary, colors.muted]
  )

  const total = bars.reduce((sum, b) => sum + b.spentMinor, 0)

  return (
    <Card testID={testID} className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-fg">Monthly spend</Text>
        <Text className="text-xs text-muted">{bars.length} months</Text>
      </View>

      {hasSpend ? (
        <View testID="stats-monthly-chart">
          <BarChart
            data={data}
            maxValue={maxValue}
            noOfSections={NO_OF_SECTIONS}
            isAnimated={false}
            barWidth={22}
            spacing={16}
            initialSpacing={14}
            barBorderRadius={4}
            frontColor={colors.primary}
            yAxisThickness={0}
            xAxisThickness={1}
            xAxisColor={colors.border}
            rulesColor={colors.border}
            rulesType="solid"
            yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
            formatYLabel={(label: string) => compactNumber(Number(label))}
            xAxisLabelTextStyle={{ color: colors.muted, fontSize: 10 }}
          />
        </View>
      ) : (
        <Text className="py-6 text-center text-sm text-muted" testID="stats-monthly-empty">
          No spend recorded in this period.
        </Text>
      )}

      <Text className="text-xs text-muted">
        Total spend, last {bars.length} months: {formatMinor(-total, currency, { showSign: false })}
      </Text>
      <ExcludedBadge count={excludedCount} testID="stats-monthly-excluded" />
    </Card>
  )
}
