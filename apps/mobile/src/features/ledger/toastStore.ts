/**
 * A one-shot toast the ledger shows AFTER returning from another screen (§8 Phase 4). The
 * entry form now lives on its own stacked route ({@link EntryScreen}); when it saves or
 * deletes it navigates back, so the confirming snackbar (and the delete Undo, which is data
 * safety) can no longer be shown by the form itself. This tiny Zustand singleton carries that
 * pending toast across the pop: the entry screen `show()`s it, and the ledger drains it on the
 * next render, showing it through its existing snackbar. Same reason as {@link filterStore} —
 * a store update re-renders subscribers directly, which also works on the web build where
 * expo-sqlite's change-listener is silent.
 */
import { create } from 'zustand'

/** A pending snackbar: a message and an optional single action (e.g. Undo a delete). */
export type LedgerToast = {
  message: string
  actionLabel?: string
  /** Runs when the action is pressed. Restores must call the DB themselves. */
  onAction?: () => void
}

type LedgerToastState = {
  toast: LedgerToast | null
  /** Queue a toast to be shown by the ledger on its next render. */
  show: (toast: LedgerToast) => void
  /** Drop the pending toast once it has been handed to the snackbar. */
  clear: () => void
}

export const useLedgerToastStore = create<LedgerToastState>((set) => ({
  toast: null,
  show: (toast) => set({ toast }),
  clear: () => set({ toast: null }),
}))
