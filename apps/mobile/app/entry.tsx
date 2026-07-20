import { EntryScreen } from '@/features/ledger'

/**
 * `/entry` route (§8 Phase 4) — the add / edit expense screen, pushed on top of the ledger so
 * the native/hardware back button pops it. No params = new expense; `?id=<entryId>` = edit.
 */
export default function EntryRoute() {
  return <EntryScreen />
}
