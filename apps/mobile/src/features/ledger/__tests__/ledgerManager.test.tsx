import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { useReducer, useState, type ReactElement } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { createCategory, createEntry, getEntry, listEntries } from '@/data'
import { todayISO } from '@/domain'
import { createTestDatabase, type TestDatabase } from '@/db/__tests__/testDb'

import { LedgerManager } from '../LedgerManager'

/**
 * Integration tests for Phase 4 (§8): the REAL ledger list driven against a REAL in-memory
 * better-sqlite3 database (§3 — no DB mocks). `Harness` stands in for the route wrapper's
 * reactive read: it re-reads the windowed ledger whenever the manager reports a change
 * (`onChanged`) — exactly the mechanism that keeps the web build (where expo-sqlite's
 * change-listener is silent) live after every mutation.
 *
 * Add / edit now live on their own stacked route ({@link EntryManager}); the ledger only
 * NAVIGATES there (via `onAddEntry` / `onEditEntry`). Those callbacks are asserted here; the
 * form itself is covered by entryManager.test.tsx.
 */
const PAGE_SIZE = 100

/** `Screen` reads safe-area insets, so tests provide a provider with fixed metrics. */
const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
}

function renderLedger(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{ui}</SafeAreaProvider>)
}

function Harness({
  db,
  onAddEntry,
  onEditEntry,
}: {
  db: TestDatabase['db']
  onAddEntry?: () => void
  onEditEntry?: (entry: { id: string }) => void
}) {
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const entries = listEntries(db, { limit })
  const hasMore = entries.length === limit
  return (
    <LedgerManager
      db={db}
      entries={entries}
      hasMore={hasMore}
      onLoadMore={() => setLimit((l) => l + PAGE_SIZE)}
      onChanged={refresh}
      onAddEntry={onAddEntry}
      onEditEntry={onEditEntry}
      onOpenCategories={() => {}}
    />
  )
}

describe('LedgerManager (§8 Phase 4 — the core)', () => {
  let h: TestDatabase
  let foodId: string
  beforeEach(() => {
    h = createTestDatabase()
    foodId = createCategory(h.db, { name: 'Food', color: '#F59E0B' }).id
  })
  afterEach(() => h.close())

  it('navigates to the add screen from the FAB', () => {
    const onAddEntry = jest.fn()
    const view = renderLedger(<Harness db={h.db} onAddEntry={onAddEntry} />)
    fireEvent.press(view.getByTestId('ledger-add-fab'))
    expect(onAddEntry).toHaveBeenCalledTimes(1)
  })

  it('navigates to the add screen from the empty-state CTA', () => {
    const onAddEntry = jest.fn()
    const view = renderLedger(<Harness db={h.db} onAddEntry={onAddEntry} />)
    fireEvent.press(view.getByText('Add your first expense'))
    expect(onAddEntry).toHaveBeenCalledTimes(1)
  })

  it('navigates to the edit screen for the tapped row, passing the entry', () => {
    const e = createEntry(h.db, {
      title: 'Old title',
      categoryId: foodId,
      amountMinor: -1200,
      currency: 'INR',
      occurredOn: todayISO(),
      tags: [],
    })
    const onEditEntry = jest.fn()
    const view = renderLedger(<Harness db={h.db} onEditEntry={onEditEntry} />)

    fireEvent.press(view.getByTestId(`ledger-row-${e.id}`))
    expect(onEditEntry).toHaveBeenCalledTimes(1)
    expect(onEditEntry.mock.calls[0][0]).toMatchObject({ id: e.id })
  })

  it('deletes an entry (it disappears) and Undo restores it live (§6.7)', async () => {
    const e = createEntry(h.db, {
      title: 'Groceries',
      categoryId: foodId,
      amountMinor: -3000,
      currency: 'INR',
      occurredOn: todayISO(),
      tags: [],
    })
    const view = renderLedger(<Harness db={h.db} />)

    fireEvent.press(view.getByTestId(`ledger-actions-toggle-${e.id}`))
    fireEvent.press(view.getByTestId(`ledger-delete-${e.id}`))

    // Gone from the list; the Undo snackbar is shown.
    await waitFor(() => expect(view.queryByText('Groceries')).toBeNull())
    expect(listEntries(h.db)).toHaveLength(0)
    expect(getEntry(h.db, e.id)?.deletedAt).not.toBeNull()
    expect(view.getByTestId('ledger-snackbar')).toBeTruthy()

    fireEvent.press(view.getByTestId('ledger-snackbar-action'))

    await waitFor(() => expect(view.getByText('Groceries')).toBeTruthy())
    expect(getEntry(h.db, e.id)?.deletedAt).toBeNull()
    expect(listEntries(h.db)).toHaveLength(1)
  })

  it("duplicates an entry to today's date, keeping the other fields", async () => {
    const e = createEntry(h.db, {
      title: 'Coffee',
      categoryId: foodId,
      amountMinor: -15000,
      currency: 'INR',
      occurredOn: '2026-01-15',
      tags: ['cafe'],
    })
    const view = renderLedger(<Harness db={h.db} />)

    fireEvent.press(view.getByTestId(`ledger-actions-toggle-${e.id}`))
    fireEvent.press(view.getByTestId(`ledger-duplicate-${e.id}`))

    await waitFor(() => expect(listEntries(h.db)).toHaveLength(2))
    const dup = listEntries(h.db).find((x) => x.id !== e.id)!
    expect(dup).toMatchObject({
      title: 'Coffee',
      amountMinor: -15000,
      categoryId: foodId,
      occurredOn: todayISO(),
    })
    expect(dup.tags).toEqual(['cafe'])
    // The clone shows under Today.
    expect(view.getByTestId(`ledger-day-${todayISO()}`)).toBeTruthy()
  })

  it('renders a correct per-day section total for multiple same-day entries', () => {
    const base = {
      categoryId: foodId,
      currency: 'INR',
      occurredOn: todayISO(),
      tags: [] as string[],
    }
    createEntry(h.db, { ...base, title: 'A', amountMinor: -100000 })
    createEntry(h.db, { ...base, title: 'B', amountMinor: -40000 })

    const view = renderLedger(<Harness db={h.db} />)
    // −100000 + −40000 minor units → −₹1,400.00 net for the day.
    expect(view.getByTestId(`ledger-day-total-${todayISO()}-INR`)).toHaveTextContent(/1,400/)
  })

  it('shows the empty state with its CTA on a fresh ledger', () => {
    const view = renderLedger(<Harness db={h.db} />)
    expect(view.getByTestId('ledger-empty')).toBeTruthy()
    expect(view.getByText('Add your first expense')).toBeTruthy()
  })
})
