import { fireEvent, render, waitFor } from '@testing-library/react-native'

import { createCategory, createEntry } from '@/data'
import { createTestDatabase, type TestDatabase } from '@/db/__tests__/testDb'

import { StatsManager } from '../StatsManager'

/**
 * Component tests for the Phase 6 dashboard (§8). They render the REAL StatsManager (summary
 * cards + the gifted-charts bar/pie + the tag-range tool) against a REAL in-memory
 * better-sqlite3 database (§3 — no DB mocks), driven by known fixture entries. Fake timers keep
 * gifted-charts' post-render label animation from firing after the Jest environment tears down.
 */
jest.useFakeTimers()

const TODAY = '2026-07-10'

describe('StatsManager (§7.6 / §8 Phase 6)', () => {
  let h: TestDatabase
  let food: string
  let transport: string
  let income: string
  beforeEach(() => {
    h = createTestDatabase()
    food = createCategory(h.db, { name: 'Food' }).id
    transport = createCategory(h.db, { name: 'Transport' }).id
    income = createCategory(h.db, { name: 'Income' }).id

    // July 2026 fixtures (default currency INR) …
    createEntry(h.db, {
      title: 'Lunch',
      categoryId: food,
      amountMinor: -3000,
      currency: 'INR',
      occurredOn: '2026-07-04',
      tags: ['coffee'],
    })
    createEntry(h.db, {
      title: 'Snack',
      categoryId: food,
      amountMinor: -2000,
      currency: 'INR',
      occurredOn: '2026-07-05',
      tags: [],
    })
    createEntry(h.db, {
      title: 'Cab',
      categoryId: transport,
      amountMinor: -6000,
      currency: 'INR',
      occurredOn: '2026-07-06',
      tags: [],
    })
    createEntry(h.db, {
      title: 'Refund',
      categoryId: income,
      amountMinor: 10000,
      currency: 'INR',
      occurredOn: '2026-07-07',
      tags: [],
    })
    // … plus one off-default-currency entry (must be excluded from sums, counted for the badge).
    createEntry(h.db, {
      title: 'Trip',
      categoryId: transport,
      amountMinor: -9900,
      currency: 'USD',
      occurredOn: '2026-07-08',
      tags: [],
    })
  })
  afterEach(() => h.close())

  function renderManager(hasAnyEntries = true) {
    return render(
      <StatsManager db={h.db} currency="INR" today={TODAY} hasAnyEntries={hasAnyEntries} />
    )
  }

  it('shows a first-run empty state when there are no entries', () => {
    const view = renderManager(false)
    expect(view.getByTestId('stats-empty')).toBeTruthy()
  })

  it('renders the selected month, summary count, and the mixed-currency badge', () => {
    const view = renderManager()
    expect(view.getByTestId('stats-month-label').props.children).toBe('July 2026')
    // 3 INR debits + 1 INR credit counted; the USD entry excluded.
    expect(view.getByTestId('stats-count-value').props.children).toBe(4)
    const badge = view.getByTestId('stats-summary-excluded')
    expect(badge.props.accessibilityLabel).toBe('1 entry in other currencies excluded')
  })

  it('renders the monthly bar chart and the by-category breakdown from real data', () => {
    const view = renderManager()
    expect(view.getByTestId('stats-monthly-chart')).toBeTruthy()
    expect(view.getByTestId('stats-category-chart')).toBeTruthy()
    // Category legend: Transport (₹60) ranks above Food (₹50); Income is credit-only → omitted.
    expect(view.getByText('Transport')).toBeTruthy()
    expect(view.getByText('Food')).toBeTruthy()
    expect(view.queryByText('Income')).toBeNull()
    // Shares of ₹110 total spend: Transport 6000/11000 ≈ 55%, Food 5000/11000 ≈ 45%.
    expect(view.getByText('55%')).toBeTruthy()
    expect(view.getByText('45%')).toBeTruthy()
  })

  it('navigates months; an empty month shows the empty breakdown and no future navigation', () => {
    const view = renderManager()
    // Current month → next is disabled (no future).
    expect(view.getByTestId('stats-next-month').props.accessibilityState.disabled).toBe(true)

    fireEvent.press(view.getByTestId('stats-prev-month'))
    expect(view.getByTestId('stats-month-label').props.children).toBe('June 2026')
    // June has no entries → zero summary + empty category breakdown.
    expect(view.getByTestId('stats-count-value').props.children).toBe(0)
    expect(view.getByTestId('stats-category-empty')).toBeTruthy()
    // Now the future (July) is navigable again.
    expect(view.getByTestId('stats-next-month').props.accessibilityState.disabled).toBe(false)
  })

  it('totals expenses by tag over a date range (multi-tag AND)', async () => {
    const view = renderManager()
    fireEvent.changeText(view.getByTestId('stats-tag-input'), 'coffee')
    fireEvent(view.getByTestId('stats-tag-input'), 'submitEditing')

    // 'coffee' is on exactly one July entry (Lunch, −₹30) → 1 entry in the "This month" preset.
    await waitFor(() => expect(view.getByText('1 entry · net')).toBeTruthy())
    expect(view.getByTestId('stats-tag-chip-coffee')).toBeTruthy()
  })
})
