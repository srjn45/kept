import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SectionList, Text, View } from 'react-native'

import { AmountText, Button, EmptyState, FAB, Screen, Snackbar } from '@/components'
import {
  createEntry,
  getCategoryById,
  restoreEntry,
  softDeleteEntry,
  type AppDatabase,
  type EntryWithTags,
} from '@/data'
import { todayISO } from '@/domain'

import { LedgerRow } from './LedgerRow'
import { FilterBar } from './FilterBar'
import { hasActiveFilters, useLedgerFilterStore } from './filterStore'
import { groupEntriesByDay } from './grouping'
import { useLedgerToastStore } from './toastStore'
import { duplicateEntryInput } from './entryForm'

/** How long the delete Undo snackbar stays up (§6.7 recovery is 30 days; this is just the toast). */
const SNACKBAR_MS = 5000

export type LedgerManagerProps = {
  /** Injected DB (production `getDatabase()`; tests inject in-memory better-sqlite3). */
  db: AppDatabase
  /** The current windowed, ordered ledger page (read reactively by the route, §8 Phase 4). */
  entries: EntryWithTags[]
  /** Whether more rows may exist beyond the current window. */
  hasMore: boolean
  /** Grow the window (load-more on reach-end). */
  onLoadMore: () => void
  /**
   * Called after every successful mutation. The real screen relies on this to re-read the
   * ledger (it is the web reactivity fix — expo-sqlite's WASM change-listener is silent, so
   * `useLiveQuery` alone never re-renders on a local write); tests use it the same way.
   */
  onChanged?: () => void
  /** Navigate to the add-expense screen (FAB / empty-state CTA). */
  onAddEntry?: () => void
  /** Navigate to the edit-expense screen for a row (tap a row). */
  onEditEntry?: (entry: EntryWithTags) => void
  /** Navigate to the Categories screen (header entry point). */
  onOpenCategories?: () => void
  /** Navigate to the Stats/dashboard screen (header entry point, §8 Phase 6). */
  onOpenStats?: () => void
  /** Navigate to the Settings screen (header entry point, §8 Phase 7 — backup export/import). */
  onOpenSettings?: () => void
}

type SnackState = { message: string; actionLabel?: string; onAction?: () => void }

/**
 * The ledger — add / edit / duplicate / delete + Undo over a day-grouped, virtualized list
 * (§8 Phase 4, "the heart of the app"). Pure and DB-injected (imports NO expo-sqlite; the
 * route wrapper owns `getDatabase` + `useLiveQuery`), so the whole flow runs under Jest
 * against a real in-memory database.
 */
export function LedgerManager({
  db,
  entries,
  hasMore,
  onLoadMore,
  onChanged,
  onAddEntry,
  onEditEntry,
  onOpenCategories,
  onOpenStats,
  onOpenSettings,
}: LedgerManagerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [snack, setSnack] = useState<SnackState | null>(null)
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Filter selections (Phase 5) live in a Zustand singleton so they survive navigation; we
  // read them here only to choose the empty-state copy and to offer a one-tap clear. The
  // actual filtered query runs in the route (LedgerScreen), which re-reads `listEntries`.
  const categoryId = useLedgerFilterStore((s) => s.categoryId)
  const filterTags = useLedgerFilterStore((s) => s.tags)
  const search = useLedgerFilterStore((s) => s.search)
  const clearFilters = useLedgerFilterStore((s) => s.clear)
  const filtersActive = hasActiveFilters({ categoryId, tags: filterTags, search })
  // Show the filter bar whenever there's something to filter or a filter is already active;
  // hide it only on a truly empty first-run ledger so the empty state stands alone.
  const showFilterBar = filtersActive || entries.length > 0

  useEffect(
    () => () => {
      if (snackTimer.current) clearTimeout(snackTimer.current)
    },
    []
  )

  const showSnackbar = useCallback((next: SnackState) => {
    if (snackTimer.current) clearTimeout(snackTimer.current)
    setSnack(next)
    snackTimer.current = setTimeout(() => setSnack(null), SNACKBAR_MS)
  }, [])

  const dismissSnackbar = useCallback(() => {
    if (snackTimer.current) clearTimeout(snackTimer.current)
    setSnack(null)
  }, [])

  // Drain a one-shot toast queued by the entry screen when it pops back here after an add /
  // edit / delete (it can't show its own snackbar while navigating away). Show it through our
  // snackbar; for a delete Undo, run the store's restore, then refresh the list and dismiss —
  // the same effect as an inline row-delete Undo.
  const pendingToast = useLedgerToastStore((s) => s.toast)
  const clearToast = useLedgerToastStore((s) => s.clear)
  useEffect(() => {
    if (!pendingToast) return
    clearToast()
    const { message, actionLabel, onAction } = pendingToast
    // Defer to a microtask so we don't setState synchronously in the effect body (cascading
    // renders); we're returning to this screen, so a tick's delay is imperceptible.
    Promise.resolve().then(() =>
      showSnackbar({
        message,
        actionLabel,
        onAction: onAction
          ? () => {
              onAction()
              onChanged?.()
              dismissSnackbar()
            }
          : undefined,
      })
    )
  }, [pendingToast, clearToast, showSnackbar, dismissSnackbar, onChanged])

  const sections = useMemo(() => groupEntriesByDay(entries, todayISO()), [entries])

  function handleDelete(entry: EntryWithTags) {
    softDeleteEntry(db, entry.id)
    setExpandedId(null)
    onChanged?.()
    showSnackbar({
      message: `Deleted “${entry.title}”.`,
      actionLabel: 'Undo',
      onAction: () => {
        restoreEntry(db, entry.id)
        onChanged?.()
        dismissSnackbar()
      },
    })
  }

  function handleDuplicate(entry: EntryWithTags) {
    createEntry(db, duplicateEntryInput(entry))
    setExpandedId(null)
    onChanged?.()
    showSnackbar({ message: `Duplicated “${entry.title}” to today.` })
  }

  // ---- List view (home) ----
  return (
    <Screen padded={false}>
      <View className="flex-1">
        <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
          <View className="gap-0.5">
            <Text className="text-2xl font-semibold text-fg">Expenses</Text>
            <Text className="text-sm text-muted">
              {entries.length === 0
                ? 'Your local ledger'
                : `${entries.length}${hasMore ? '+' : ''} recent ${
                    entries.length === 1 ? 'entry' : 'entries'
                  }`}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Button
              label="Stats"
              variant="secondary"
              size="sm"
              onPress={() => onOpenStats?.()}
              testID="ledger-open-stats"
            />
            <Button
              label="Categories"
              variant="secondary"
              size="sm"
              onPress={() => onOpenCategories?.()}
              testID="ledger-open-categories"
            />
            <Button
              label="Settings"
              variant="secondary"
              size="sm"
              onPress={() => onOpenSettings?.()}
              testID="ledger-open-settings"
            />
          </View>
        </View>

        {showFilterBar ? <FilterBar db={db} testID="ledger-filter-bar" /> : null}

        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingBottom: 112, gap: 8 }}
          stickySectionHeadersEnabled
          keyboardShouldPersistTaps="handled"
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasMore) onLoadMore()
          }}
          renderSectionHeader={({ section }) => (
            <View
              className="flex-row items-center justify-between bg-bg py-2"
              testID={`ledger-day-${section.date}`}
            >
              <Text className="text-sm font-semibold text-fg">{section.title}</Text>
              <View className="flex-row items-center gap-2">
                {section.totals.map((t) => (
                  <AmountText
                    key={t.currency}
                    amountMinor={t.net}
                    currency={t.currency}
                    size="sm"
                    testID={`ledger-day-total-${section.date}-${t.currency}`}
                  />
                ))}
              </View>
            </View>
          )}
          renderItem={({ item }) => {
            const category = getCategoryById(db, item.categoryId)
            return (
              <LedgerRow
                entry={item}
                categoryName={category?.name ?? 'Uncategorised'}
                categoryColor={category?.color}
                expanded={expandedId === item.id}
                onToggleActions={() => setExpandedId((id) => (id === item.id ? null : item.id))}
                onEdit={() => {
                  setExpandedId(null)
                  onEditEntry?.(item)
                }}
                onDuplicate={() => handleDuplicate(item)}
                onDelete={() => handleDelete(item)}
              />
            )
          }}
          ListEmptyComponent={
            filtersActive ? (
              <EmptyState
                title="No matching expenses"
                description="No expenses match your current filters. Try removing a tag, changing the category, or clearing the search."
                actionLabel="Clear filters"
                onAction={clearFilters}
                testID="ledger-empty-filtered"
              />
            ) : (
              <EmptyState
                title="No expenses yet"
                description="Record your first expense — it's a 5-second, one-thumb task. Your data stays on your device."
                actionLabel="Add your first expense"
                onAction={() => onAddEntry?.()}
                testID="ledger-empty"
              />
            )
          }
          ListFooterComponent={
            hasMore ? (
              <View className="items-center py-4">
                <Button
                  label="Load more"
                  variant="ghost"
                  size="sm"
                  onPress={onLoadMore}
                  testID="ledger-load-more"
                />
              </View>
            ) : null
          }
        />

        <FAB
          accessibilityLabel="Add expense"
          onPress={() => onAddEntry?.()}
          testID="ledger-add-fab"
        />

        <Snackbar
          visible={snack !== null}
          message={snack?.message ?? ''}
          actionLabel={snack?.actionLabel}
          onAction={snack?.onAction}
          testID="ledger-snackbar"
        />
      </View>
    </Screen>
  )
}
