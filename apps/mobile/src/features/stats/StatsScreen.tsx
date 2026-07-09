import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useReducer } from 'react'
import { Pressable, Text } from 'react-native'

import { Screen } from '@/components'
import { getSettings, ledgerLiveQuery, listEntries } from '@/data'
import { getDatabase } from '@/db/client'
import { todayISO } from '@/domain'

import { StatsManager } from './StatsManager'

/**
 * Route-level Stats screen (§7.6 · Phase 6). The ONLY piece here that touches expo-sqlite; it
 * delegates all UI + aggregation to the pure, DB-injected {@link StatsManager} (unit-testable).
 *
 * Reactivity: `useLiveQuery` is the native change signal — its listener re-renders us on every
 * DB write. The web (WASM) build does NOT emit those events, and stats reads happen on a
 * separate route, so we ALSO bump `refresh` whenever this screen regains focus (`useFocusEffect`)
 * — returning here after adding/editing an expense on the ledger re-reads every aggregate. Both
 * targets therefore show fresh numbers; we always read through the repo (the source of truth, §4).
 */
export function StatsScreen() {
  const db = getDatabase()
  const [, refresh] = useReducer((n: number) => n + 1, 0)

  // Native change subscription; `.data` is intentionally ignored — we read via the repo.
  useLiveQuery(ledgerLiveQuery(db, 1))
  // Re-read on focus so returning from the ledger reflects new/edited/deleted entries on web.
  useFocusEffect(useCallback(() => refresh(), []))

  const defaultCurrency = getSettings(db)?.defaultCurrency ?? 'INR'
  const hasAnyEntries = listEntries(db, { limit: 1 }).length > 0

  return (
    <Screen scroll contentClassName="gap-4">
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        className="self-start"
      >
        <Text className="text-base text-primary">‹ Back</Text>
      </Pressable>

      <Text className="text-2xl font-semibold text-fg">Stats</Text>

      <StatsManager
        db={db}
        currency={defaultCurrency}
        today={todayISO()}
        hasAnyEntries={hasAnyEntries}
        onOpenLedger={() => router.back()}
      />
    </Screen>
  )
}
