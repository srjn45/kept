import { parseBackupText } from '@/domain'
import { appSettings, categories, entryTags, ledgerEntries, tagSuggestions } from '@/db/schema'
import { seedDatabase } from '@/db/seed'
import { createTestDatabase, type TestDatabase } from '@/db/__tests__/testDb'

import {
  buildBackup,
  createCategory,
  createEntry,
  deactivateCategory,
  exportEntriesCsv,
  findCategoryByName,
  formatCsvAmount,
  getSettings,
  importBackup,
  importEntriesCsv,
  listCategories,
  listEntries,
  parseCsvAmount,
  serializeBackup,
  softDeleteEntry,
  updateSettings,
} from '@/data'

/** Snapshot the raw contents of every table for fidelity comparisons. */
function dump(db: TestDatabase['db']) {
  const sortBy = <T>(rows: T[], key: (r: T) => string) =>
    [...rows].sort((a, b) => key(a).localeCompare(key(b)))
  return {
    categories: sortBy(db.select().from(categories).all(), (r) => r.id),
    entries: sortBy(db.select().from(ledgerEntries).all(), (r) => r.id),
    entryTags: sortBy(db.select().from(entryTags).all(), (r) => `${r.entryId}|${r.tag}`),
    tagSuggestions: sortBy(db.select().from(tagSuggestions).all(), (r) => r.tag),
    settings: db.select().from(appSettings).all(),
  }
}

/** Build a database with a representative, full-fidelity data set. */
function seedRichData(db: TestDatabase['db']) {
  seedDatabase(db)
  const coffee = createCategory(db, { name: 'Coffee', color: '#F59E0B' })
  const retired = createCategory(db, { name: 'Retired Cat' })
  deactivateCategory(db, retired.id) // an INACTIVE category must survive a backup (§6.7)

  createEntry(db, {
    title: 'Latte',
    categoryId: coffee.id,
    amountMinor: -35000,
    currency: 'INR',
    occurredOn: '2026-07-04',
    tags: ['coffee', 'morning'],
  })
  const refund = createEntry(db, {
    title: 'Refund',
    categoryId: coffee.id,
    amountMinor: 12000,
    currency: 'INR',
    occurredOn: '2026-07-05',
    tags: ['coffee'],
  })
  const deleted = createEntry(db, {
    title: 'Mistake',
    categoryId: retired.id,
    amountMinor: -9900,
    currency: 'USD',
    occurredOn: '2026-07-06',
    tags: ['oops'],
  })
  softDeleteEntry(db, deleted.id) // a SOFT-DELETED entry must be in the JSON backup (§6.7)
  return { coffee, retired, refund, deleted }
}

describe('JSON backup round-trip (§8 Phase 7 DoD)', () => {
  let a: TestDatabase
  let b: TestDatabase
  beforeEach(() => {
    a = createTestDatabase()
    b = createTestDatabase()
  })
  afterEach(() => {
    a.close()
    b.close()
  })

  it('REPLACE reproduces identical data (incl. soft-deleted entries and inactive categories)', () => {
    seedRichData(a.db)
    const text = serializeBackup(a.db, '1.0.0')

    const parsed = parseBackupText(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    importBackup(b.db, parsed.backup, { strategy: 'replace' })

    const da = dump(a.db)
    const dbb = dump(b.db)
    expect(dbb.categories).toEqual(da.categories)
    expect(dbb.entries).toEqual(da.entries)
    expect(dbb.entryTags).toEqual(da.entryTags)
    expect(dbb.tagSuggestions).toEqual(da.tagSuggestions)
    // Full fidelity includes the soft-deleted row and the inactive category.
    expect(dbb.entries.some((e) => e.deletedAt !== null)).toBe(true)
    expect(dbb.categories.some((c) => c.active === 0)).toBe(true)
  })

  it('REPLACE restores defaultCurrency but PRESERVES the device lock flags', () => {
    // Source backup says pin is set + EUR default.
    seedDatabase(a.db)
    updateSettings(a.db, { defaultCurrency: 'EUR', pinSet: true, biometricsEnabled: true })
    const backup = buildBackup(a.db, '1.0.0')

    // Target device has its OWN pin state that must not be overwritten by the backup.
    seedDatabase(b.db)
    updateSettings(b.db, { pinSet: true })

    importBackup(b.db, backup, { strategy: 'replace' })

    const s = getSettings(b.db)!
    expect(s.defaultCurrency).toBe('EUR') // restored from backup
    expect(s.pinSet).toBe(1) // preserved from the device (not the backup)
    expect(s.biometricsEnabled).toBe(0) // preserved from the device (was off)
  })
})

describe('JSON backup MERGE semantics', () => {
  let a: TestDatabase
  let b: TestDatabase
  beforeEach(() => {
    a = createTestDatabase()
    b = createTestDatabase()
  })
  afterEach(() => {
    a.close()
    b.close()
  })

  it('adds new rows, skips existing ids, and never clobbers local edits', () => {
    // Target A: seeded + one local entry.
    seedDatabase(a.db)
    const localCat = createCategory(a.db, { name: 'Local' })
    const local = createEntry(a.db, {
      title: 'Local entry',
      categoryId: localCat.id,
      amountMinor: -500,
      currency: 'INR',
      occurredOn: '2026-07-01',
      tags: [],
    })

    // Backup source B: seeded + a different entry in a new category.
    seedDatabase(b.db)
    const groceries = findCategoryByName(b.db, 'Groceries')!
    createEntry(b.db, {
      title: 'From backup',
      categoryId: groceries.id,
      amountMinor: -2500,
      currency: 'INR',
      occurredOn: '2026-07-02',
      tags: ['merged'],
    })
    const backup = buildBackup(b.db, '1.0.0')

    importBackup(a.db, backup, { strategy: 'merge' })

    const titles = listEntries(a.db)
      .map((e) => e.title)
      .sort()
    expect(titles).toEqual(['From backup', 'Local entry'])
    // Local entry untouched.
    expect(listEntries(a.db).find((e) => e.id === local.id)?.title).toBe('Local entry')
    // Seed categories not duplicated (same deterministic ids).
    expect(
      listCategories(a.db, { includeInactive: true }).filter((c) => c.name === 'Groceries')
    ).toHaveLength(1)
  })

  it('folds a name-colliding category (different id) into the existing one', () => {
    seedDatabase(a.db)
    const existing = createCategory(a.db, { name: 'Coffee' }) // id X

    seedDatabase(b.db)
    const other = createCategory(b.db, { name: 'coffee' }) // id Y, same name (case-insensitive)
    createEntry(b.db, {
      title: 'Espresso',
      categoryId: other.id,
      amountMinor: -300,
      currency: 'INR',
      occurredOn: '2026-07-03',
      tags: [],
    })
    const backup = buildBackup(b.db, '1.0.0')

    importBackup(a.db, backup, { strategy: 'merge' })

    // No duplicate "coffee" category; the merged entry points at the surviving one.
    const coffees = listCategories(a.db, { includeInactive: true }).filter(
      (c) => c.name.toLowerCase() === 'coffee'
    )
    expect(coffees).toHaveLength(1)
    const espresso = listEntries(a.db).find((e) => e.title === 'Espresso')!
    expect(espresso.categoryId).toBe(existing.id)
  })
})

describe('schemaVersion validation (§8 Phase 7)', () => {
  it('accepts a well-formed version-1 backup', () => {
    const h = createTestDatabase()
    seedDatabase(h.db)
    const res = parseBackupText(serializeBackup(h.db, '1.0.0'))
    expect(res.ok).toBe(true)
    h.close()
  })

  it('rejects invalid JSON', () => {
    const res = parseBackupText('{not json')
    expect(res).toMatchObject({ ok: false, code: 'invalid-json' })
  })

  it('rejects JSON that is not a backup (missing schemaVersion)', () => {
    const res = parseBackupText(JSON.stringify({ hello: 'world' }))
    expect(res).toMatchObject({ ok: false, code: 'not-a-backup' })
  })

  it('rejects an unknown / future schemaVersion with a clear message', () => {
    const res = parseBackupText(JSON.stringify({ schemaVersion: 999, app: 'expense-manager' }))
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe('unsupported-version')
      expect(res.message).toMatch(/version 999/)
    }
  })

  it('rejects a version-1 envelope with a corrupted shape', () => {
    const bad = {
      schemaVersion: 1,
      app: 'expense-manager',
      appVersion: '1.0.0',
      exportedAt: 0,
      data: {},
    }
    const res = parseBackupText(JSON.stringify(bad))
    expect(res).toMatchObject({ ok: false, code: 'invalid-shape' })
  })
})

describe('CSV export (§6.7 excludes soft-deleted)', () => {
  let h: TestDatabase
  beforeEach(() => {
    h = createTestDatabase()
  })
  afterEach(() => h.close())

  it('excludes soft-deleted rows and signs amounts (debit bare, credit +)', () => {
    seedRichData(h.db)
    const csv = exportEntriesCsv(h.db)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('date,title,amount,currency,category,tags,description')
    expect(csv).toContain('Latte')
    expect(csv).toContain('Refund')
    expect(csv).not.toContain('Mistake') // soft-deleted → excluded
    // Debit is a bare positive number; credit carries a leading '+'.
    expect(csv).toMatch(/2026-07-04,Latte,350\.00,INR,Coffee,coffee\|morning,/)
    expect(csv).toMatch(/2026-07-05,Refund,\+120\.00,INR,Coffee,coffee,/)
  })

  it('formats amounts at the currency precision', () => {
    expect(formatCsvAmount(-350, 'INR')).toBe('3.50')
    expect(formatCsvAmount(500, 'INR')).toBe('+5.00')
    expect(formatCsvAmount(-1000, 'JPY')).toBe('1000') // 0-decimal currency
    expect(formatCsvAmount(-1500, 'KWD')).toBe('1.500') // 3-decimal currency
  })
})

describe('CSV amount parsing sign convention', () => {
  it('treats bare / leading-minus as debit and leading-plus as credit', () => {
    expect(parseCsvAmount('12.50', 'INR')).toBe(-1250)
    expect(parseCsvAmount('-12.50', 'INR')).toBe(-1250)
    expect(parseCsvAmount('+12.50', 'INR')).toBe(1250)
    expect(parseCsvAmount('0', 'INR')).toBeNull()
    expect(parseCsvAmount('abc', 'INR')).toBeNull()
    expect(parseCsvAmount('', 'INR')).toBeNull()
  })
})

describe('CSV import (legacy data path, §8 Phase 7)', () => {
  let h: TestDatabase
  beforeEach(() => {
    h = createTestDatabase()
    seedDatabase(h.db)
  })
  afterEach(() => h.close())

  const opts = { defaultCurrency: 'INR' as const }

  it('imports valid rows, auto-creates categories, and parses tags', () => {
    const csv = [
      'date,title,amount,currency,category,tags,description',
      '2026-07-04,Latte,3.50,INR,Coffee Shop,coffee|morning,Flat white',
      '2026-07-05,Salary,+1000,INR,Income,,Monthly pay',
    ].join('\n')

    const report = importEntriesCsv(h.db, csv, opts)
    expect(report).toMatchObject({ imported: 2, skipped: 0, total: 2 })

    const entries = listEntries(h.db)
    const latte = entries.find((e) => e.title === 'Latte')!
    expect(latte.amountMinor).toBe(-350) // bare → debit
    expect(latte.tags).toEqual(['coffee', 'morning'])
    expect(latte.description).toBe('Flat white')
    const salary = entries.find((e) => e.title === 'Salary')!
    expect(salary.amountMinor).toBe(100000) // '+' → credit
    // A category that did not exist was auto-created.
    expect(findCategoryByName(h.db, 'Coffee Shop')).toBeTruthy()
  })

  it('reactivates an inactive category instead of creating a duplicate', () => {
    const cat = createCategory(h.db, { name: 'Gym' })
    deactivateCategory(h.db, cat.id)
    const csv = 'date,title,amount,category\n2026-07-04,Membership,20.00,Gym'

    const report = importEntriesCsv(h.db, csv, opts)
    expect(report.imported).toBe(1)
    expect(findCategoryByName(h.db, 'Gym')).toMatchObject({ id: cat.id, active: 1 })
    expect(
      listCategories(h.db, { includeInactive: true }).filter((c) => c.name === 'Gym')
    ).toHaveLength(1)
  })

  it('falls back to the default currency and Miscellaneous category when cells are blank', () => {
    const csv = 'date,title,amount,currency,category\n2026-07-04,Snack,1.00,,'
    const report = importEntriesCsv(h.db, csv, { defaultCurrency: 'EUR' })
    expect(report.imported).toBe(1)
    const snack = listEntries(h.db).find((e) => e.title === 'Snack')!
    expect(snack.currency).toBe('EUR')
    const misc = findCategoryByName(h.db, 'Miscellaneous')!
    expect(snack.categoryId).toBe(misc.id)
  })

  it('reports skipped rows with reasons and still imports the good ones', () => {
    const csv = [
      'date,title,amount,category',
      '2026-07-04,Good,5.00,Food & Dining', // ok
      '2026-13-40,BadDate,5.00,Food & Dining', // invalid date
      '2026-07-05,BadAmount,abc,Food & Dining', // invalid amount
      '2026-07-06,,5.00,Food & Dining', // missing title
      '2026-07-07,ZeroAmt,0,Food & Dining', // zero amount invalid
    ].join('\n')

    const report = importEntriesCsv(h.db, csv, opts)
    expect(report.imported).toBe(1)
    expect(report.skipped).toBe(4)
    expect(report.total).toBe(5)
    expect(report.errors.map((e) => e.row).sort((x, y) => x - y)).toEqual([3, 4, 5, 6])
    expect(report.errors.find((e) => e.row === 3)?.reason).toMatch(/date/)
    expect(report.errors.find((e) => e.row === 4)?.reason).toMatch(/amount/)
    expect(report.errors.find((e) => e.row === 5)?.reason).toMatch(/title/)
  })

  it('returns an all-zero report for an empty file', () => {
    expect(importEntriesCsv(h.db, '', opts)).toEqual({
      imported: 0,
      skipped: 0,
      total: 0,
      errors: [],
    })
    expect(importEntriesCsv(h.db, '   \n  ', opts)).toEqual({
      imported: 0,
      skipped: 0,
      total: 0,
      errors: [],
    })
  })

  it('throws a clear error when required columns are missing', () => {
    expect(() => importEntriesCsv(h.db, 'foo,bar\n1,2', opts)).toThrow(/date.*title.*amount/i)
  })

  it('round-trips an exported CSV back in with matching signs', () => {
    createEntry(h.db, {
      title: 'Bus',
      categoryId: findCategoryByName(h.db, 'Transport')!.id,
      amountMinor: -4500,
      currency: 'INR',
      occurredOn: '2026-07-08',
      tags: ['commute'],
    })
    const csv = exportEntriesCsv(h.db)

    const target = createTestDatabase()
    seedDatabase(target.db)
    const report = importEntriesCsv(target.db, csv, opts)
    expect(report.imported).toBe(1)
    const bus = listEntries(target.db).find((e) => e.title === 'Bus')!
    expect(bus.amountMinor).toBe(-4500)
    expect(bus.tags).toEqual(['commute'])
    target.close()
  })
})
