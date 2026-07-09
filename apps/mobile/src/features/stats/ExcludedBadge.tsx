import { Text, View } from 'react-native'

export type ExcludedBadgeProps = {
  /** Number of entries excluded because they are in a non-default currency (§8 Phase 6). */
  count: number
  testID?: string
}

/**
 * The mixed-currency exclusion badge (§8 Phase 6). Renders ONLY when `count > 0`: when the
 * queried range holds entries in a currency other than the default, those are never summed in
 * (no conversion in the MVP) — this tells the user how many were left out so the totals are
 * honest. Below the badge, totals reflect the default currency alone.
 */
export function ExcludedBadge({ count, testID }: ExcludedBadgeProps) {
  if (count <= 0) return null
  const label = `${count} ${count === 1 ? 'entry' : 'entries'} in other currencies excluded`
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={label}
      className="self-start rounded-chip border border-border bg-surface-alt px-2 py-1"
    >
      <Text className="text-xs text-muted">{label}</Text>
    </View>
  )
}
