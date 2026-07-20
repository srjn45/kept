import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useReducer, useState } from 'react'

import { ledgerLiveQuery, listEntries } from '@/data'
import { getDatabase } from '@/db/client'

import { LedgerManager } from './LedgerManager'
import { filterSignature, toListFilters, useLedgerFilterStore } from './filterStore'

/** First page size / load-more increment (§8 Phase 4 perf guardrail: windowed, never unbounded). */
const PAGE_SIZE = 100

/**
 * Route-level ledger screen — the app's HOME (§8 Phase 4). The ONLY piece here that touches
 * expo-sqlite; it delegates all UI + mutations to the pure, DB-injected {@link LedgerManager}
 * (unit-testable under Jest).
 *
 * Reactivity (the phase's #1 risk): `useLiveQuery` is the reactive signal — on NATIVE its
 * change-listener re-renders us on every DB write. The web (WASM) build does NOT emit those
 * change events, so the manager ALSO calls `onChanged` after each in-app mutation, which bumps
 * `refresh` here (event-driven, not polling). Either signal re-renders this route; we then
 * read the current WINDOW through `listEntries` (the single source of truth, §4), so the list
 * is always fresh — live — on both targets after add / edit / delete / undo / duplicate.
 */
export function LedgerScreen() {
  const db = getDatabase()
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [, refresh] = useReducer((n: number) => n + 1, 0)

  // Filter selections (Phase 5) — subscribing here re-renders on every filter change, which
  // re-runs `listEntries` below. This is a plain React state dependency, NOT the web
  // change-listener gap: filtering never mutates the DB, so it doesn't rely on `useLiveQuery`.
  const categoryId = useLedgerFilterStore((s) => s.categoryId)
  const tags = useLedgerFilterStore((s) => s.tags)
  const search = useLedgerFilterStore((s) => s.search)
  const selection = { categoryId, tags, search }
  const signature = filterSignature(selection)

  // Reset the pagination window whenever the filter changes, so we never keep an oversized
  // window or append filtered-out stale pages across a filter switch (§8 Phase 5). This is the
  // React-recommended "adjust state during render" pattern (no effect, no cascading commit).
  const [prevSignature, setPrevSignature] = useState(signature)
  if (signature !== prevSignature) {
    setPrevSignature(signature)
    setLimit(PAGE_SIZE)
  }

  // Native change subscription; its `.data` is intentionally ignored — we read via the repo.
  useLiveQuery(ledgerLiveQuery(db, limit))
  // Re-read on focus so returning from Settings after a bulk JSON restore / CSV import shows the
  // new rows live on web, where expo-sqlite's WASM change-listener stays silent for bulk writes
  // made off this screen (§8 reactivity note). Harmless on native (useLiveQuery already covers it).
  useFocusEffect(useCallback(() => refresh(), [refresh]))

  const entries = listEntries(db, { ...toListFilters(selection), limit })
  const hasMore = entries.length === limit

  return (
    <LedgerManager
      db={db}
      entries={entries}
      hasMore={hasMore}
      onLoadMore={() => setLimit((l) => l + PAGE_SIZE)}
      onChanged={refresh}
      onAddEntry={() => router.push('/entry')}
      onEditEntry={(entry) => router.push({ pathname: '/entry', params: { id: entry.id } })}
      onOpenCategories={() => router.push('/categories')}
      onOpenStats={() => router.push('/stats')}
      onOpenSettings={() => router.push('/settings')}
    />
  )
}
