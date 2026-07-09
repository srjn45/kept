/**
 * Ledger filter state (§6.3, §7.2 · Phase 5). A small Zustand store holding ONLY the ledger's
 * filter UI selections — category, the multi-tag AND set, and the free-text search. It is a
 * module singleton, so selections SURVIVE navigating away from the ledger and back (e.g.
 * opening Categories and returning) without any persistence middleware.
 *
 * It holds no IO and no DB handle: the store is the single source of truth for *what the user
 * asked to filter by*; the route reads it, builds a {@link ListEntriesFilters}, and re-runs
 * `listEntries` (the real row source, §4). Keeping this in Zustand rather than local React
 * state is also what makes filter changes reactive on the web build, where expo-sqlite's
 * change-listener is silent — a store update re-renders every subscriber directly.
 */
import { create } from 'zustand'

import type { ListEntriesFilters } from '@/data'

export type LedgerFilterState = {
  /** Selected category id, or null for "All" (no category restriction). */
  categoryId: string | null
  /** Selected tags — combined with AND (an entry must have ALL of them, §6.2/§6.3). */
  tags: string[]
  /** Free-text search over title + description. */
  search: string

  /** Set (or clear, with null) the single-select category filter. */
  setCategoryId: (id: string | null) => void
  /** Add the tag if absent, remove it if present (normalisation happens in the repo). */
  toggleTag: (tag: string) => void
  /** Remove one tag from the AND set. */
  removeTag: (tag: string) => void
  /** Set the free-text search term. */
  setSearch: (search: string) => void
  /** Reset every dimension back to "no filters". */
  clear: () => void
}

export const useLedgerFilterStore = create<LedgerFilterState>((set) => ({
  categoryId: null,
  tags: [],
  search: '',

  setCategoryId: (id) => set({ categoryId: id }),

  toggleTag: (tag) =>
    set((s) => ({
      tags: s.tags.includes(tag) ? s.tags.filter((t) => t !== tag) : [...s.tags, tag],
    })),

  removeTag: (tag) => set((s) => ({ tags: s.tags.filter((t) => t !== tag) })),

  setSearch: (search) => set({ search }),

  clear: () => set({ categoryId: null, tags: [], search: '' }),
}))

/** The filter dimensions as a plain object (pure — easy to unit test without the hook). */
export type LedgerFilterSelection = Pick<LedgerFilterState, 'categoryId' | 'tags' | 'search'>

/** True when any dimension is active (drives the "clear" affordance + empty-state copy). */
export function hasActiveFilters(s: LedgerFilterSelection): boolean {
  return s.categoryId !== null || s.tags.length > 0 || s.search.trim().length > 0
}

/**
 * Project the filter selection into the `listEntries` filter shape (§6.3). Omits empty
 * dimensions so the repo query stays minimal; leaves `limit`/`offset` to the caller (the
 * route owns the pagination window). Trims the search — a blank/whitespace query is no filter.
 */
export function toListFilters(s: LedgerFilterSelection): ListEntriesFilters {
  const search = s.search.trim()
  return {
    ...(s.categoryId ? { categoryId: s.categoryId } : {}),
    ...(s.tags.length > 0 ? { tags: s.tags } : {}),
    ...(search ? { search } : {}),
  }
}

/**
 * A stable string key for the active filter selection. The route uses it to detect a filter
 * change and RESET the pagination window (§8 Phase 5: pagination must reset when filters
 * change, never append filtered-out stale pages). Encoded via `JSON.stringify` so arbitrary
 * search text can never collide with a different selection's key; tags are sorted so order
 * doesn't matter.
 */
export function filterSignature(s: LedgerFilterSelection): string {
  return JSON.stringify([s.categoryId ?? '', [...s.tags].sort(), s.search.trim()])
}
