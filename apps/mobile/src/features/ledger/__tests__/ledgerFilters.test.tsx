import { fireEvent, render, waitFor, within } from '@testing-library/react-native'
import { useReducer, useState, type ReactElement } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { createCategory, createEntry, listEntries } from '@/data'
import { todayISO } from '@/domain'
import { createTestDatabase, type TestDatabase } from '@/db/__tests__/testDb'

import { LedgerManager } from '../LedgerManager'
import { filterSignature, toListFilters, useLedgerFilterStore } from '../filterStore'

/**
 * Phase 5 integration tests: the REAL FilterBar (inside LedgerManager) driving the REAL
 * `listEntries` query against a REAL in-memory better-sqlite3 database (§3 — no DB mocks).
 * `Harness` mirrors the route (LedgerScreen): it subscribes to the filter store, projects the
 * selection into `listEntries` filters, and RESETS the pagination window when the filter
 * signature changes — the exact wiring §8 Phase 5 requires.
 */
/** waitFor budget for debounced-search assertions — generous so a loaded CI runner doesn't flake. */
const SEARCH_WAIT_MS = 5000

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
}

function renderLedger(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{ui}</SafeAreaProvider>)
}

function Harness({ db, pageSize = 100 }: { db: TestDatabase['db']; pageSize?: number }) {
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const [limit, setLimit] = useState(pageSize)
  const categoryId = useLedgerFilterStore((s) => s.categoryId)
  const tags = useLedgerFilterStore((s) => s.tags)
  const search = useLedgerFilterStore((s) => s.search)
  const selection = { categoryId, tags, search }
  const signature = filterSignature(selection)

  // Mirror the route's pagination reset (adjust-state-during-render, not an effect).
  const [prevSignature, setPrevSignature] = useState(signature)
  if (signature !== prevSignature) {
    setPrevSignature(signature)
    setLimit(pageSize)
  }

  const entries = listEntries(db, { ...toListFilters(selection), limit })
  const hasMore = entries.length === limit
  return (
    <LedgerManager
      db={db}
      entries={entries}
      hasMore={hasMore}
      onLoadMore={() => setLimit((l) => l + pageSize)}
      onChanged={refresh}
      onOpenCategories={() => {}}
    />
  )
}

/** Add a tag to the AND filter by typing it and submitting (independent of autocomplete). */
function addTagFilter(view: ReturnType<typeof renderLedger>, tag: string) {
  fireEvent.changeText(view.getByTestId('filter-tag-input'), tag)
  fireEvent(view.getByTestId('filter-tag-input'), 'submitEditing')
}

describe('Ledger filtering & search (§8 Phase 5)', () => {
  let h: TestDatabase
  let foodId: string
  let travelId: string

  beforeEach(() => {
    useLedgerFilterStore.setState({ categoryId: null, tags: [], search: '' })
    h = createTestDatabase()
    foodId = createCategory(h.db, { name: 'Food' }).id
    travelId = createCategory(h.db, { name: 'Travel' }).id
  })
  afterEach(() => h.close())

  const entry = (over: Partial<Parameters<typeof createEntry>[1]> = {}) =>
    createEntry(h.db, {
      title: 'Item',
      categoryId: foodId,
      amountMinor: -1000,
      currency: 'INR',
      occurredOn: todayISO(),
      tags: [],
      ...over,
    })

  it('filters by category (single-select)', () => {
    entry({ title: 'Lunch', categoryId: foodId })
    entry({ title: 'Flight', categoryId: travelId })
    const view = renderLedger(<Harness db={h.db} />)

    expect(view.getByText('Lunch')).toBeTruthy()
    expect(view.getByText('Flight')).toBeTruthy()

    fireEvent.press(view.getByTestId(`filter-category-${travelId}`))

    expect(view.getByText('Flight')).toBeTruthy()
    expect(view.queryByText('Lunch')).toBeNull()

    // "All" restores everything.
    fireEvent.press(view.getByTestId('filter-category-all'))
    expect(view.getByText('Lunch')).toBeTruthy()
  })

  it('multi-tag filter is RESTRICTIVE AND — entry must have ALL selected tags (§6.2/§6.3)', () => {
    entry({ title: 'Both', tags: ['coffee', 'work'] })
    entry({ title: 'CoffeeOnly', tags: ['coffee'] })
    entry({ title: 'WorkOnly', tags: ['work'] })
    const view = renderLedger(<Harness db={h.db} />)

    // One tag → any entry carrying it.
    addTagFilter(view, 'coffee')
    expect(view.getByText('Both')).toBeTruthy()
    expect(view.getByText('CoffeeOnly')).toBeTruthy()
    expect(view.queryByText('WorkOnly')).toBeNull()

    // Add a second tag → only the entry with BOTH survives (the AND, not OR).
    addTagFilter(view, 'work')
    expect(view.getByText('Both')).toBeTruthy()
    expect(view.queryByText('CoffeeOnly')).toBeNull()
    expect(view.queryByText('WorkOnly')).toBeNull()

    // The selected filter tags render as chips.
    expect(view.getByTestId('filter-tag-chip-coffee')).toBeTruthy()
    expect(view.getByTestId('filter-tag-chip-work')).toBeTruthy()
  })

  it('searches title/description with a debounce', async () => {
    entry({ title: 'Team lunch', description: 'with client' })
    entry({ title: 'Taxi', description: 'airport ride' })
    const view = renderLedger(<Harness db={h.db} />)

    fireEvent.changeText(view.getByTestId('filter-search-input'), 'lunch')
    // The 250ms search debounce is a REAL timer; on a CPU-saturated CI runner the timer callback
    // + VirtualizedList re-render can exceed waitFor's 1s default, so give it headroom (mirrors the
    // testTimeout=20s rationale in jest.config.js — tolerates a loaded runner, weakens nothing).
    await waitFor(() => expect(view.queryByText('Taxi')).toBeNull(), { timeout: SEARCH_WAIT_MS })
    expect(view.getByText('Team lunch')).toBeTruthy()

    // Matches description too.
    fireEvent.changeText(view.getByTestId('filter-search-input'), 'airport')
    await waitFor(() => expect(view.getByText('Taxi')).toBeTruthy(), { timeout: SEARCH_WAIT_MS })
    expect(view.queryByText('Team lunch')).toBeNull()
  })

  it('combines category + tags + search with AND (§6.3)', async () => {
    entry({ title: 'Team lunch', categoryId: foodId, tags: ['work'] })
    entry({ title: 'Solo lunch', categoryId: foodId, tags: ['personal'] })
    entry({ title: 'Work trip lunch', categoryId: travelId, tags: ['work'] })
    const view = renderLedger(<Harness db={h.db} />)

    fireEvent.press(view.getByTestId(`filter-category-${foodId}`))
    addTagFilter(view, 'work')
    fireEvent.changeText(view.getByTestId('filter-search-input'), 'lunch')

    await waitFor(() => expect(view.getByText('Team lunch')).toBeTruthy(), {
      timeout: SEARCH_WAIT_MS,
    })
    expect(view.queryByText('Solo lunch')).toBeNull() // wrong tag
    expect(view.queryByText('Work trip lunch')).toBeNull() // wrong category
  })

  it('clears all filters via the Clear affordance', () => {
    entry({ title: 'Lunch', categoryId: foodId, tags: ['work'] })
    entry({ title: 'Flight', categoryId: travelId })
    const view = renderLedger(<Harness db={h.db} />)

    fireEvent.press(view.getByTestId(`filter-category-${foodId}`))
    addTagFilter(view, 'work')
    expect(view.queryByText('Flight')).toBeNull()

    fireEvent.press(view.getByTestId('filter-clear'))
    expect(view.getByText('Lunch')).toBeTruthy()
    expect(view.getByText('Flight')).toBeTruthy()
    expect(view.getByTestId('filter-category-all')).toBeTruthy()
  })

  it('shows the filtered empty state (distinct from first-run) when nothing matches', () => {
    entry({ title: 'Lunch', categoryId: foodId })
    const view = renderLedger(<Harness db={h.db} />)

    addTagFilter(view, 'nonexistent')

    const empty = view.getByTestId('ledger-empty-filtered')
    expect(empty).toBeTruthy()
    expect(view.queryByTestId('ledger-empty')).toBeNull()
    // The empty state's own "Clear filters" CTA restores the list.
    fireEvent.press(within(empty).getByText('Clear filters'))
    expect(view.getByText('Lunch')).toBeTruthy()
  })

  it('persists filter selection across unmount/remount (navigation away and back)', () => {
    entry({ title: 'Lunch', categoryId: foodId })
    entry({ title: 'Flight', categoryId: travelId })
    const first = renderLedger(<Harness db={h.db} />)
    fireEvent.press(first.getByTestId(`filter-category-${travelId}`))
    expect(first.queryByText('Lunch')).toBeNull()
    first.unmount()

    // Remount (as if returning from Categories) — the Travel filter is still applied.
    const second = renderLedger(<Harness db={h.db} />)
    expect(second.getByText('Flight')).toBeTruthy()
    expect(second.queryByText('Lunch')).toBeNull()
  })

  it('resets pagination when filters change (no oversized/stale window)', () => {
    // 3 matching Food entries with a page size of 2: the load-more affordance is a
    // virtualization-independent signal of the window size. It is shown when a further page
    // exists, hidden once everything is loaded, and must reappear after a filter reset.
    entry({ title: 'F1', categoryId: foodId, occurredOn: '2026-01-03' })
    entry({ title: 'F2', categoryId: foodId, occurredOn: '2026-01-02' })
    entry({ title: 'F3', categoryId: foodId, occurredOn: '2026-01-01' })
    const view = renderLedger(<Harness db={h.db} pageSize={2} />)

    // One page (2) loaded of 3 → load-more is offered.
    expect(view.getByTestId('ledger-load-more')).toBeTruthy()

    // Grow the window to include all 3 → nothing more to load.
    fireEvent.press(view.getByTestId('ledger-load-more'))
    expect(view.queryByTestId('ledger-load-more')).toBeNull()

    // Changing a filter (all 3 still match) must RESET the window to one page → load-more back.
    fireEvent.press(view.getByTestId(`filter-category-${foodId}`))
    expect(view.getByTestId('ledger-load-more')).toBeTruthy()
  })
})
