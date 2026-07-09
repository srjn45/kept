import { Text, View } from 'react-native'

import { AmountText, Card } from '@/components'
import type { AmountAggregate } from '@/data'

export type SummaryCardsProps = {
  /** This-period aggregate (default currency only, §8 Phase 6). */
  summary: AmountAggregate
  /** Default currency the amounts are in. */
  currency: string
  testID?: string
}

/** One labelled summary tile. */
function SummaryTile({
  label,
  children,
  testID,
}: {
  label: string
  children: React.ReactNode
  testID?: string
}) {
  return (
    <View className="min-w-[45%] flex-1">
      <Card testID={testID} className="gap-1">
        <Text className="text-xs font-medium uppercase tracking-wide text-muted">{label}</Text>
        {children}
      </Card>
    </View>
  )
}

/**
 * The dashboard summary cards (§7.6): total spent, total received, net, and entry count for
 * the selected month — DEFAULT currency only. Spend and credit use the semantic money colors
 * via {@link AmountText} (which also carries the sign, never color alone). Built only from the
 * primitives kit (§7.7).
 */
export function SummaryCards({ summary, currency, testID }: SummaryCardsProps) {
  return (
    <View className="flex-row flex-wrap gap-3" testID={testID}>
      <SummaryTile label="Spent" testID="stats-card-spent">
        <AmountText
          amountMinor={summary.debitMinor}
          currency={currency}
          size="lg"
          testID="stats-spent-amount"
        />
      </SummaryTile>
      <SummaryTile label="Received" testID="stats-card-received">
        <AmountText
          amountMinor={summary.creditMinor}
          currency={currency}
          size="lg"
          testID="stats-received-amount"
        />
      </SummaryTile>
      <SummaryTile label="Net" testID="stats-card-net">
        <AmountText
          amountMinor={summary.net}
          currency={currency}
          size="lg"
          testID="stats-net-amount"
        />
      </SummaryTile>
      <SummaryTile label="Entries" testID="stats-card-count">
        <Text
          className="text-lg font-semibold text-fg"
          style={{ fontVariant: ['tabular-nums'] }}
          testID="stats-count-value"
        >
          {summary.count}
        </Text>
      </SummaryTile>
    </View>
  )
}
