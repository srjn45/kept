import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SectionList, Text, View } from 'react-native'

import { AmountText, Button, EmptyState, FAB, Screen, Snackbar } from '@/components'
import {
  createEntry,
  getCategoryById,
  listCategories,
  restoreEntry,
  softDeleteEntry,
  updateEntry,
  type AppDatabase,
  type EntryWithTags,
} from '@/data'
import { todayISO } from '@/domain'
import type { Category } from '@/db/schema'

import { LedgerRow } from './LedgerRow'
import { EntryForm } from './EntryForm'
import { FilterBar } from './FilterBar'
import { hasActiveFilters, useLedgerFilterStore } from './filterStore'
import { groupEntriesByDay } from './grouping'
import {
  duplicateEntryInput,
  emptyFormValues,
  entryToFormValues,
  formToEntryInput,
  type EntryFormValues,
} from './entryForm'

/** How long the delete Undo snackbar stays up (§6.7 recovery is 30 days; this is just the toast). */
const SNACKBAR_MS = 5000

export type LedgerManagerProps = {
  /** Injected DB (production `getDatabase()`; tests inject in-memory better-sqlite3). */
  db: AppDatabase
  /** The current windowed, ordered ledger page (read reactively by the route, §8 Phase 4). */
  entries: EntryWithTags[]
  /** Default currency for a new entry (from `app_settings`). */
  defaultCurrency: string
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
  /** Navigate to the Categories screen (header entry point). */
  onOpenCategories?: () => void
}

type View_ = { mode: 'list' } | { mode: 'add' } | { mode: 'edit'; entry: EntryWithTags }
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
  defaultCurrency,
  hasMore,
  onLoadMore,
  onChanged,
  onOpenCategories,
}: LedgerManagerProps) {
  const [view, setView] = useState<View_>({ mode: 'list' })
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | undefined>()
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

  const sections = useMemo(() => groupEntriesByDay(entries, todayISO()), [entries])

  function backToList() {
    setView({ mode: 'list' })
    setSubmitError(undefined)
  }

  async function handleSubmit(values: EntryFormValues) {
    setBusy(true)
    setSubmitError(undefined)
    try {
      if (view.mode === 'add') {
        createEntry(db, formToEntryInput(values))
        onChanged?.()
        backToList()
        showSnackbar({ message: 'Expense added.' })
      } else if (view.mode === 'edit') {
        updateEntry(db, view.entry.id, formToEntryInput(values))
        onChanged?.()
        backToList()
        showSnackbar({ message: 'Changes saved.' })
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not save the expense.')
    } finally {
      setBusy(false)
    }
  }

  function handleDelete(entry: EntryWithTags) {
    softDeleteEntry(db, entry.id)
    setExpandedId(null)
    if (view.mode !== 'list') backToList()
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

  // ---- Add / Edit form view ----
  if (view.mode !== 'list') {
    const editing = view.mode === 'edit' ? view.entry : null
    // Active categories for the picker; re-read here so newly added ones show up.
    const activeCategories = listCategories(db)
    // Include the entry's own category even if it was later deactivated, so it shows selected.
    const pickerCategories: Category[] = (() => {
      if (!editing) return activeCategories
      if (activeCategories.some((c) => c.id === editing.categoryId)) return activeCategories
      const own = getCategoryById(db, editing.categoryId)
      return own ? [...activeCategories, own] : activeCategories
    })()

    return (
      <Screen scroll contentClassName="gap-4">
        <EntryForm
          mode={editing ? 'edit' : 'add'}
          db={db}
          categories={pickerCategories}
          initial={editing ? entryToFormValues(editing) : emptyFormValues(defaultCurrency)}
          onSubmit={handleSubmit}
          onCancel={backToList}
          onDelete={editing ? () => handleDelete(editing) : undefined}
          busy={busy}
          submitError={submitError}
        />
      </Screen>
    )
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
          <Button
            label="Categories"
            variant="secondary"
            size="sm"
            onPress={() => onOpenCategories?.()}
            testID="ledger-open-categories"
          />
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
                  setView({ mode: 'edit', entry: item })
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
                onAction={() => setView({ mode: 'add' })}
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
          onPress={() => setView({ mode: 'add' })}
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
