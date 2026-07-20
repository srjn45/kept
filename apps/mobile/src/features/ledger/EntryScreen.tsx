import { router, useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'

import {
  getCategoryById,
  getEntry,
  getSettings,
  listCategories,
  restoreEntry,
  type EntryWithTags,
} from '@/data'
import { getDatabase } from '@/db/client'
import type { Category } from '@/db/schema'

import { EntryManager } from './EntryManager'
import { useLedgerToastStore } from './toastStore'

/**
 * Route-level add / edit expense screen (§8 Phase 4) — pushed on top of the ledger, so the
 * native/hardware back button and the back-swipe gesture pop it (same effect as Cancel). Reached
 * with no params for a new expense, or `?id=<entryId>` to edit one. The ONLY piece here that
 * touches expo-sqlite; it resolves the entry + categories and delegates the whole form to the
 * pure, DB-injected {@link EntryManager}.
 *
 * On save / delete it navigates back and hands a one-shot toast to the ledger through
 * {@link useLedgerToastStore} — the confirming snackbar (and the delete Undo, which is data
 * safety, §6.7) can't be shown by a screen that's popping itself. The ledger re-reads on focus
 * (its `useFocusEffect` refresh), so the new/updated/removed row is live on return.
 */
export function EntryScreen() {
  const db = getDatabase()
  const params = useLocalSearchParams<{ id?: string }>()
  const showToast = useLedgerToastStore((s) => s.show)

  const id = typeof params.id === 'string' && params.id.length > 0 ? params.id : undefined
  const entry = id ? getEntry(db, id) : undefined
  const mode: 'add' | 'edit' = id ? 'edit' : 'add'

  // Edit route for an entry that no longer exists (e.g. deleted in another tab / stale link):
  // there's nothing to edit, so pop back instead of rendering an empty form.
  useEffect(() => {
    if (mode === 'edit' && !entry && router.canGoBack()) router.back()
  }, [mode, entry])

  if (mode === 'edit' && !entry) return null

  // Active categories for the picker, plus the entry's own category even if later deactivated,
  // so it still shows selected while editing (§7.4).
  const activeCategories = listCategories(db)
  const pickerCategories: Category[] =
    entry && !activeCategories.some((c) => c.id === entry.categoryId)
      ? (() => {
          const own = getCategoryById(db, entry.categoryId)
          return own ? [...activeCategories, own] : activeCategories
        })()
      : activeCategories

  const defaultCurrency = getSettings(db)?.defaultCurrency ?? 'INR'

  const handleSaved = (savedMode: 'add' | 'edit') => {
    showToast({ message: savedMode === 'add' ? 'Expense added.' : 'Changes saved.' })
    if (router.canGoBack()) router.back()
  }

  const handleDeleted = (deleted: EntryWithTags) => {
    showToast({
      message: `Deleted “${deleted.title}”.`,
      actionLabel: 'Undo',
      onAction: () => restoreEntry(db, deleted.id),
    })
    if (router.canGoBack()) router.back()
  }

  const handleCancel = () => {
    if (router.canGoBack()) router.back()
  }

  return (
    <EntryManager
      db={db}
      mode={mode}
      entry={entry}
      categories={pickerCategories}
      defaultCurrency={defaultCurrency}
      onSaved={handleSaved}
      onDeleted={handleDeleted}
      onCancel={handleCancel}
    />
  )
}
