/** Ledger feature barrel (§8 Phase 4/5). The route imports the screen; internals stay private. */
export { LedgerScreen } from './LedgerScreen'
export { LedgerManager, type LedgerManagerProps } from './LedgerManager'
export { EntryScreen } from './EntryScreen'
export { EntryManager, type EntryManagerProps } from './EntryManager'
// Filter state (Phase 5) — exported so later phases (e.g. Stats) can reuse the same selection.
export {
  useLedgerFilterStore,
  hasActiveFilters,
  toListFilters,
  filterSignature,
  type LedgerFilterState,
  type LedgerFilterSelection,
} from './filterStore'
