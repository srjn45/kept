import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { useReducer, type ReactElement } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import {
  createEntry,
  findCategoryByName,
  getSettings,
  listEntries,
  serializeBackup,
  softDeleteEntry,
} from '@/data'
import { parseBackupText } from '@/domain'
import { seedDatabase } from '@/db/seed'
import { createTestDatabase, type TestDatabase } from '@/db/__tests__/testDb'

import type { ExportRequest, FileKind, PickedFile } from '../fileIo'
import { SettingsManager } from '../SettingsManager'

/**
 * Component tests for Phase 7 export/import (§8). Drive the REAL UI against a REAL in-memory
 * better-sqlite3 database (§3 — no DB mocks). File I/O is injected so the flow is exercised
 * end-to-end without a share sheet / OS picker.
 */
function makeIo() {
  const exports: ExportRequest[] = []
  return {
    exports,
    exportFile: jest.fn(async (req: ExportRequest) => {
      exports.push(req)
    }),
    pickTextFile: jest.fn(async (_kind: FileKind): Promise<PickedFile | null> => null),
  }
}

/** `Screen` reads safe-area insets, so tests provide a provider with fixed metrics. */
const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
}

function renderScreen(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{ui}</SafeAreaProvider>)
}

function Harness({ db, io }: { db: TestDatabase['db']; io: ReturnType<typeof makeIo> }) {
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const defaultCurrency = getSettings(db)?.defaultCurrency ?? 'INR'
  return (
    <SettingsManager
      db={db}
      appVersion="9.9.9"
      defaultCurrency={defaultCurrency}
      onChanged={refresh}
      exportFile={io.exportFile}
      pickTextFile={io.pickTextFile}
    />
  )
}

describe('SettingsManager (§7.5 / §8 Phase 7)', () => {
  let h: TestDatabase
  beforeEach(() => {
    h = createTestDatabase()
    seedDatabase(h.db)
  })
  afterEach(() => h.close())

  it('displays the app version', () => {
    const view = renderScreen(<Harness db={h.db} io={makeIo()} />)
    expect(view.getByTestId('settings-app-version')).toHaveTextContent('Version 9.9.9')
  })

  it('exports a JSON backup that includes soft-deleted entries', async () => {
    const cat = findCategoryByName(h.db, 'Food & Dining')!
    createEntry(h.db, {
      title: 'Kept',
      categoryId: cat.id,
      amountMinor: -100,
      currency: 'INR',
      occurredOn: '2026-07-04',
      tags: [],
    })
    const gone = createEntry(h.db, {
      title: 'Deleted one',
      categoryId: cat.id,
      amountMinor: -200,
      currency: 'INR',
      occurredOn: '2026-07-05',
      tags: [],
    })
    softDeleteEntry(h.db, gone.id)

    const io = makeIo()
    const view = renderScreen(<Harness db={h.db} io={io} />)
    fireEvent.press(view.getByTestId('settings-export-json'))

    await waitFor(() => expect(io.exportFile).toHaveBeenCalled())
    const req = io.exports[0]
    expect(req.mimeType).toBe('application/json')
    expect(req.filename).toMatch(/^kept-backup-.*\.json$/)
    const parsed = parseBackupText(req.content)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      const titles = parsed.backup.data.ledgerEntries.map((e) => e.title)
      expect(titles).toEqual(expect.arrayContaining(['Kept', 'Deleted one']))
    }
  })

  it('exports CSV excluding soft-deleted rows', async () => {
    const cat = findCategoryByName(h.db, 'Food & Dining')!
    createEntry(h.db, {
      title: 'Visible',
      categoryId: cat.id,
      amountMinor: -100,
      currency: 'INR',
      occurredOn: '2026-07-04',
      tags: [],
    })
    const gone = createEntry(h.db, {
      title: 'Hidden',
      categoryId: cat.id,
      amountMinor: -200,
      currency: 'INR',
      occurredOn: '2026-07-05',
      tags: [],
    })
    softDeleteEntry(h.db, gone.id)

    const io = makeIo()
    const view = renderScreen(<Harness db={h.db} io={io} />)
    fireEvent.press(view.getByTestId('settings-export-csv'))

    await waitFor(() => expect(io.exportFile).toHaveBeenCalled())
    const req = io.exports[0]
    expect(req.mimeType).toBe('text/csv')
    expect(req.content).toContain('Visible')
    expect(req.content).not.toContain('Hidden')
  })

  it('restores a JSON backup with REPLACE behind a confirmation', async () => {
    // Build a backup from a separate DB with a distinctive entry.
    const source = createTestDatabase()
    seedDatabase(source.db)
    createEntry(source.db, {
      title: 'FromBackup',
      categoryId: findCategoryByName(source.db, 'Travel')!.id,
      amountMinor: -5000,
      currency: 'INR',
      occurredOn: '2026-07-09',
      tags: ['trip'],
    })
    const backupText = serializeBackup(source.db, '1.0.0')
    source.close()

    const io = makeIo()
    io.pickTextFile.mockResolvedValueOnce({ name: 'backup.json', content: backupText })

    const view = renderScreen(<Harness db={h.db} io={io} />)
    fireEvent.press(view.getByTestId('settings-import-json'))

    // A confirmation panel appears; nothing imported yet.
    await waitFor(() => expect(view.getByTestId('settings-restore-confirm')).toBeTruthy())
    expect(listEntries(h.db).find((e) => e.title === 'FromBackup')).toBeUndefined()

    fireEvent.press(view.getByTestId('settings-restore-replace'))

    await waitFor(() => expect(view.getByTestId('settings-notice')).toBeTruthy())
    expect(listEntries(h.db).find((e) => e.title === 'FromBackup')).toBeTruthy()
  })

  it('shows an error for an invalid backup file and no confirmation', async () => {
    const io = makeIo()
    io.pickTextFile.mockResolvedValueOnce({ name: 'x.json', content: '{bad' })

    const view = renderScreen(<Harness db={h.db} io={io} />)
    fireEvent.press(view.getByTestId('settings-import-json'))

    await waitFor(() => expect(view.getByTestId('settings-notice')).toBeTruthy())
    expect(view.queryByTestId('settings-restore-confirm')).toBeNull()
    expect(view.getByText(/not valid JSON/i)).toBeTruthy()
  })

  it('imports a CSV and shows a success/skip report', async () => {
    const csv = [
      'date,title,amount,category',
      '2026-07-04,GoodRow,5.00,Food & Dining',
      '2026-07-05,BadRow,notanumber,Food & Dining',
    ].join('\n')
    const io = makeIo()
    io.pickTextFile.mockResolvedValueOnce({ name: 'data.csv', content: csv })

    const view = renderScreen(<Harness db={h.db} io={io} />)
    fireEvent.press(view.getByTestId('settings-import-csv'))

    await waitFor(() => expect(view.getByTestId('settings-import-report')).toBeTruthy())
    expect(view.getByText(/1 imported, 1 skipped/)).toBeTruthy()
    expect(view.getByText(/Row 3:/)).toBeTruthy()
    expect(listEntries(h.db).find((e) => e.title === 'GoodRow')).toBeTruthy()
  })

  it('does nothing when the file picker is cancelled', async () => {
    const io = makeIo()
    io.pickTextFile.mockResolvedValueOnce(null)

    const view = renderScreen(<Harness db={h.db} io={io} />)
    fireEvent.press(view.getByTestId('settings-import-csv'))

    await waitFor(() => expect(io.pickTextFile).toHaveBeenCalled())
    expect(view.queryByTestId('settings-import-report')).toBeNull()
    expect(view.queryByTestId('settings-notice')).toBeNull()
  })
})
