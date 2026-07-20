import { useState } from 'react'
import { Pressable, Text } from 'react-native'

import { Screen } from '@/components'
import {
  createEntry,
  softDeleteEntry,
  updateEntry,
  updateSettings,
  type AppDatabase,
  type EntryWithTags,
} from '@/data'
import type { Category } from '@/db/schema'

import { EntryForm } from './EntryForm'
import {
  emptyFormValues,
  entryToFormValues,
  formToEntryInput,
  type EntryFormValues,
} from './entryForm'

export type EntryManagerProps = {
  /** Injected DB (production `getDatabase()`; tests inject in-memory better-sqlite3). */
  db: AppDatabase
  /** Add a new expense, or edit the entry passed in `entry`. */
  mode: 'add' | 'edit'
  /** The entry being edited (edit mode only). */
  entry?: EntryWithTags
  /** Categories for the picker (active + the entry's own, even if later deactivated). */
  categories: Category[]
  /** Default currency for a new entry (from `app_settings`). */
  defaultCurrency: string
  /** Called after a successful create/update so the route can pop + confirm. */
  onSaved: (mode: 'add' | 'edit') => void
  /** Called after a soft-delete so the route can pop + offer Undo. */
  onDeleted: (entry: EntryWithTags) => void
  /** Cancel / back — the route pops without writing. */
  onCancel: () => void
}

/**
 * Add / edit expense screen (§7.3), now a STACKED route of its own ({@link EntryScreen}) rather
 * than an inline mode swap on the ledger — so the native/hardware back button and the back-swipe
 * gesture pop it, exactly like Cancel. Pure and DB-injected (imports NO expo-sqlite; the route
 * wrapper owns `getDatabase` + navigation), so the whole create/update/delete flow runs under
 * Jest against a real in-memory database. The "last used currency" default (§7.3) is remembered
 * here on save, and delete is a soft-delete whose Undo snackbar is raised back on the ledger.
 */
export function EntryManager({
  db,
  mode,
  entry,
  categories,
  defaultCurrency,
  onSaved,
  onDeleted,
  onCancel,
}: EntryManagerProps) {
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | undefined>()

  const initial =
    mode === 'edit' && entry ? entryToFormValues(entry) : emptyFormValues(defaultCurrency)

  // Remember the currency just used as the default for the NEXT new entry (§7.3 "default is the
  // last used currency"). Best-effort: the entry is already saved, so a failure here must never
  // surface as a save error.
  function rememberLastCurrency(currency: string) {
    if (currency === defaultCurrency) return
    try {
      updateSettings(db, { defaultCurrency: currency })
    } catch {
      // Non-critical — ignore.
    }
  }

  async function handleSubmit(values: EntryFormValues) {
    setBusy(true)
    setSubmitError(undefined)
    try {
      if (mode === 'edit' && entry) {
        updateEntry(db, entry.id, formToEntryInput(values))
      } else {
        createEntry(db, formToEntryInput(values))
      }
      rememberLastCurrency(values.currency)
      onSaved(mode)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not save the expense.')
      setBusy(false)
    }
  }

  function handleDelete() {
    if (!entry) return
    softDeleteEntry(db, entry.id)
    onDeleted(entry)
  }

  return (
    <Screen scroll contentClassName="gap-4">
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        className="self-start"
        testID="entry-back"
      >
        <Text className="text-base text-primary">‹ Back</Text>
      </Pressable>

      <EntryForm
        mode={mode}
        db={db}
        categories={categories}
        initial={initial}
        onSubmit={handleSubmit}
        onCancel={onCancel}
        onDelete={mode === 'edit' && entry ? handleDelete : undefined}
        busy={busy}
        submitError={submitError}
      />
    </Screen>
  )
}
