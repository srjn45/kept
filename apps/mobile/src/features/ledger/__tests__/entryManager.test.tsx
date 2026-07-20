import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { type ComponentProps, type ReactElement } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import {
  createCategory,
  createEntry,
  getEntry,
  listCategories,
  listEntries,
  searchTagSuggestions,
} from '@/data'
import { todayISO } from '@/domain'
import { createTestDatabase, type TestDatabase } from '@/db/__tests__/testDb'

import { EntryManager } from '../EntryManager'

/**
 * Component tests for the add / edit expense screen (§7.3), now its own stacked route
 * ({@link EntryManager}). The REAL form is driven against a REAL in-memory better-sqlite3
 * database (§3 — no DB mocks). Navigation is injected (`onSaved` / `onDeleted` / `onCancel`),
 * so the create / update / delete flow is exercised end-to-end without the router.
 */
const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
}

function renderScreen(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{ui}</SafeAreaProvider>)
}

describe('EntryManager (§7.3 add / edit)', () => {
  let h: TestDatabase
  let foodId: string
  beforeEach(() => {
    h = createTestDatabase()
    foodId = createCategory(h.db, { name: 'Food', color: '#F59E0B' }).id
  })
  afterEach(() => h.close())

  function addProps(over: Partial<ComponentProps<typeof EntryManager>> = {}) {
    return {
      db: h.db,
      mode: 'add' as const,
      categories: listCategories(h.db),
      defaultCurrency: 'INR',
      onSaved: jest.fn(),
      onDeleted: jest.fn(),
      onCancel: jest.fn(),
      ...over,
    }
  }

  it('creates a debit entry from the form (negative sign from the default toggle, §6.1)', async () => {
    const onSaved = jest.fn()
    const view = renderScreen(<EntryManager {...addProps({ onSaved })} />)

    fireEvent.changeText(view.getByTestId('entry-title-input'), 'Lunch')
    fireEvent.changeText(view.getByTestId('entry-amount-input'), '12.50')
    fireEvent.press(view.getByTestId(`category-pick-${foodId}`))
    fireEvent.press(view.getByTestId('entry-save'))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('add'))
    const rows = listEntries(h.db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ title: 'Lunch', amountMinor: -1250, categoryId: foodId })
  })

  it('derives a POSITIVE amount when the Credit toggle is chosen (no wrong-sign UI bug)', async () => {
    const onSaved = jest.fn()
    const view = renderScreen(<EntryManager {...addProps({ onSaved })} />)

    fireEvent.changeText(view.getByTestId('entry-title-input'), 'Refund')
    fireEvent.changeText(view.getByTestId('entry-amount-input'), '5')
    fireEvent.press(view.getByTestId('entry-type-credit'))
    fireEvent.press(view.getByTestId(`category-pick-${foodId}`))
    fireEvent.press(view.getByTestId('entry-save'))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('add'))
    expect(listEntries(h.db)[0].amountMinor).toBe(500)
  })

  it('edits an entry and persists the change', async () => {
    const e = createEntry(h.db, {
      title: 'Old title',
      categoryId: foodId,
      amountMinor: -1200,
      currency: 'INR',
      occurredOn: todayISO(),
      tags: [],
    })
    const onSaved = jest.fn()
    const view = renderScreen(<EntryManager {...addProps({ mode: 'edit', entry: e, onSaved })} />)

    fireEvent.changeText(view.getByTestId('entry-title-input'), 'New title')
    fireEvent.press(view.getByTestId('entry-save'))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('edit'))
    expect(getEntry(h.db, e.id)?.title).toBe('New title')
  })

  it('upserts tag suggestions when an entry is saved with tags (§6.2)', async () => {
    const onSaved = jest.fn()
    const view = renderScreen(<EntryManager {...addProps({ onSaved })} />)

    fireEvent.changeText(view.getByTestId('entry-title-input'), 'Latte')
    fireEvent.changeText(view.getByTestId('entry-amount-input'), '4')
    fireEvent.press(view.getByTestId(`category-pick-${foodId}`))

    // Reveal the "More" section, type a tag and commit it.
    fireEvent.press(view.getByTestId('entry-more-toggle'))
    fireEvent.changeText(view.getByTestId('tag-text-input'), 'espresso')
    fireEvent(view.getByTestId('tag-text-input'), 'submitEditing')
    expect(view.getByTestId('tag-chip-espresso')).toBeTruthy()

    fireEvent.press(view.getByTestId('entry-save'))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('add'))
    expect(searchTagSuggestions(h.db, 'esp')).toContain('espresso')
    expect(listEntries(h.db)[0].tags).toEqual(['espresso'])
  })

  it('converts a typed space into a tag chip and keeps typing the next one (§6.2)', () => {
    const view = renderScreen(<EntryManager {...addProps()} />)
    fireEvent.press(view.getByTestId('entry-more-toggle'))

    fireEvent.changeText(view.getByTestId('tag-text-input'), 'week end')
    expect(view.getByTestId('tag-chip-week')).toBeTruthy()
    expect(view.getByTestId('tag-text-input').props.value).toBe('end')
  })

  it('converts a typed comma into a tag chip (§6.2)', () => {
    const view = renderScreen(<EntryManager {...addProps()} />)
    fireEvent.press(view.getByTestId('entry-more-toggle'))

    fireEvent.changeText(view.getByTestId('tag-text-input'), 'coffee,')
    expect(view.getByTestId('tag-chip-coffee')).toBeTruthy()
    expect(view.getByTestId('tag-text-input').props.value).toBe('')
  })

  it('soft-deletes from the edit form and reports the entry for the ledger Undo (§6.7)', () => {
    const e = createEntry(h.db, {
      title: 'Groceries',
      categoryId: foodId,
      amountMinor: -3000,
      currency: 'INR',
      occurredOn: todayISO(),
      tags: [],
    })
    const onDeleted = jest.fn()
    const view = renderScreen(<EntryManager {...addProps({ mode: 'edit', entry: e, onDeleted })} />)

    fireEvent.press(view.getByTestId('entry-delete'))

    expect(getEntry(h.db, e.id)?.deletedAt).not.toBeNull()
    expect(onDeleted).toHaveBeenCalledTimes(1)
    expect(onDeleted.mock.calls[0][0]).toMatchObject({ id: e.id })
  })

  it('cancels (back) without writing anything', () => {
    const onCancel = jest.fn()
    const view = renderScreen(<EntryManager {...addProps({ onCancel })} />)

    fireEvent.press(view.getByTestId('entry-back'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    fireEvent.press(view.getByTestId('entry-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(listEntries(h.db)).toHaveLength(0)
  })
})
