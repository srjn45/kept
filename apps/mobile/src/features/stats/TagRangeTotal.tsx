import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { AmountText, Card, Chip, Input } from '@/components'
import { searchTagSuggestions, tagRangeTotal, type AppDatabase } from '@/data'
import { monthEndDate, monthOf, monthStartDate, shiftMonth } from '@/domain'

import { ExcludedBadge } from './ExcludedBadge'

/** The date-range presets offered for the custom tag total (relative to "today"). */
export type RangePreset = 'month' | '3months' | 'year' | 'all'

const PRESET_LABELS: Record<RangePreset, string> = {
  month: 'This month',
  '3months': 'Last 3 months',
  year: 'This year',
  all: 'All time',
}

const PRESET_ORDER: RangePreset[] = ['month', '3months', 'year', 'all']

/** Resolve a preset to an inclusive `{ from?, to? }` YYYY-MM-DD range, relative to `today`. */
export function resolveRange(preset: RangePreset, today: string): { from?: string; to?: string } {
  const month = monthOf(today)
  switch (preset) {
    case 'month':
      return { from: monthStartDate(month), to: monthEndDate(month) }
    case '3months':
      return { from: monthStartDate(shiftMonth(month, -2)), to: monthEndDate(month) }
    case 'year': {
      const year = today.slice(0, 4)
      return { from: `${year}-01-01`, to: `${year}-12-31` }
    }
    case 'all':
      return {}
  }
}

export type TagRangeTotalProps = {
  /** Injected DB — read-only here (tag suggestions + the aggregation query). */
  db: AppDatabase
  /** Default currency for the total (§8 Phase 6). */
  currency: string
  /** Today as `YYYY-MM-DD`, so the presets resolve deterministically (testable). */
  today: string
  testID?: string
}

/**
 * Custom total-by-tags for a date range (§8 Phase 6). The user picks one or more tags (AND
 * semantics — an entry counts only if it has ALL of them, the same rule as the ledger filter,
 * §6.3) and a date-range preset; the card shows the matching total for the DEFAULT currency,
 * the entry count, and the mixed-currency exclusion badge when applicable. Self-contained
 * interactive state; the aggregation runs through {@link tagRangeTotal}.
 */
export function TagRangeTotal({ db, currency, today, testID }: TagRangeTotalProps) {
  const [tags, setTags] = useState<string[]>([])
  const [tagQuery, setTagQuery] = useState('')
  const [preset, setPreset] = useState<RangePreset>('month')

  const suggestions = useMemo(() => {
    const selected = new Set(tags)
    return searchTagSuggestions(db, tagQuery, { mode: 'prefix', limit: 8 }).filter(
      (t) => !selected.has(t)
    )
  }, [db, tagQuery, tags])

  function addTag(tag: string) {
    const t = tag.trim().toLowerCase()
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t])
    setTagQuery('')
  }
  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag))
  }

  const range = resolveRange(preset, today)
  const result = useMemo(
    () => tagRangeTotal(db, { currency, tags, from: range.from, to: range.to }),
    [db, currency, tags, range.from, range.to]
  )
  const hasTags = tags.length > 0

  return (
    <Card testID={testID} className="gap-3">
      <Text className="text-base font-semibold text-fg">Total by tags</Text>
      <Text className="text-xs text-muted">
        Pick tag(s) and a period to total matching expenses (an entry must have all selected tags).
      </Text>

      {/* Selected tags */}
      {hasTags ? (
        <View className="flex-row flex-wrap gap-2" testID="stats-tag-selected">
          {tags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              selected
              onRemove={() => removeTag(tag)}
              testID={`stats-tag-chip-${tag}`}
            />
          ))}
        </View>
      ) : null}

      {/* Tag input */}
      <Input
        value={tagQuery}
        onChangeText={(next) => setTagQuery(next.replace(/\s/g, ''))}
        onSubmitEditing={() => addTag(tagQuery)}
        placeholder="Add a tag"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        blurOnSubmit={false}
        accessibilityLabel="Add a tag to total"
        testID="stats-tag-input"
      />

      {/* Tag suggestions */}
      {suggestions.length > 0 ? (
        <View className="flex-row flex-wrap gap-2" testID="stats-tag-suggestions">
          {suggestions.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => addTag(tag)}
              accessibilityRole="button"
              accessibilityLabel={`Add tag ${tag}`}
              testID={`stats-tag-suggestion-${tag}`}
            >
              <Chip label={`+ ${tag}`} size="sm" />
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Date-range presets */}
      <View className="flex-row flex-wrap gap-2" testID="stats-tag-range-presets">
        {PRESET_ORDER.map((p) => (
          <Chip
            key={p}
            label={PRESET_LABELS[p]}
            selected={preset === p}
            onPress={() => setPreset(p)}
            testID={`stats-tag-range-${p}`}
          />
        ))}
      </View>

      {/* Result */}
      {hasTags ? (
        <View className="gap-1 border-t border-border pt-3" testID="stats-tag-result">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-muted">
              {result.count} {result.count === 1 ? 'entry' : 'entries'} · net
            </Text>
            <AmountText
              amountMinor={result.net}
              currency={currency}
              size="lg"
              testID="stats-tag-total-amount"
            />
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-muted">Spent</Text>
            <AmountText
              amountMinor={result.debitMinor}
              currency={currency}
              size="sm"
              testID="stats-tag-spent-amount"
            />
          </View>
          <ExcludedBadge count={result.otherCurrencyCount} testID="stats-tag-excluded" />
        </View>
      ) : (
        <Text className="border-t border-border pt-3 text-sm text-muted">
          Add at least one tag to see a total.
        </Text>
      )}
    </Card>
  )
}
