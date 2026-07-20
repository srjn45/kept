/**
 * Backup export / import (§8 Phase 7) — the data-layer engine behind the Settings screen.
 *
 * Framework-agnostic (injected {@link AppDatabase}), so the whole round-trip runs under Jest
 * against in-memory better-sqlite3 exactly as it does on device — no mocks.
 *
 * Two formats:
 *  1. JSON backup — a full-fidelity dump of EVERY table wrapped in the versioned envelope from
 *     `src/domain/backup.ts`. Includes soft-deleted entries and inactive categories (§6.7), so
 *     a REPLACE import reproduces the source database exactly (the round-trip DoD).
 *  2. CSV — entries only, EXCLUDING soft-deleted rows (§6.7, the user-facing view). This is the
 *     legacy-data bridge; the importer auto-creates missing categories and reports skipped rows.
 *
 * CSV column format (this app's own, self-contained — documented for `import`/`export`):
 *   date,title,amount,currency,category,tags,description
 *   - date        YYYY-MM-DD (a full calendar date; required)
 *   - title       required
 *   - amount      decimal in MAJOR units. SIGN CONVENTION: a leading "+" marks a CREDIT
 *                 (money in); anything else — a bare number or a leading "-" — is a DEBIT
 *                 (money out, the default for an expense). Zero is invalid. Export writes
 *                 credits with a leading "+" and debits as a bare positive number, so an
 *                 exported CSV re-imports with identical signs.
 *   - currency    ISO 4217 (optional; falls back to the app's default currency)
 *   - category    category name (auto-created / reactivated if missing; blank → Miscellaneous)
 *   - tags        tags joined with "|" (the {@link CSV_TAG_DELIMITER})
 *   - description optional note
 */
import { isNull, sql } from 'drizzle-orm'

import {
  BACKUP_APP_ID,
  BACKUP_SCHEMA_VERSION,
  escapeCsvInjection,
  isValidISODate,
  minorUnitExponent,
  parseAmountInput,
  parseCsv,
  stringifyCsv,
  unescapeCsvInjection,
  type BackupFile,
} from '@/domain'
import { now } from '@/domain/dates'
import {
  APP_SETTINGS_ID,
  appSettings,
  categories,
  entryTags,
  ledgerEntries,
  tagSuggestions,
} from '@/db/schema'
import type { AppDatabase } from '@/db/types'

import {
  createCategory,
  findCategoryByName,
  getCategoryById,
  reactivateCategory,
} from './categoriesRepo'
import { createEntry, listEntries } from './entriesRepo'
import { getSettings } from './settingsRepo'

// ---------------------------------------------------------------------------
// JSON backup (full fidelity)
// ---------------------------------------------------------------------------

/** Read every table into the versioned envelope. Entries INCLUDE soft-deleted rows (§6.7). */
export function buildBackup(db: AppDatabase, appVersion: string): BackupFile {
  const cats = db.select().from(categories).all()
  const entries = db.select().from(ledgerEntries).all() // all rows, incl. soft-deleted
  const tags = db.select().from(entryTags).all()
  const suggestions = db.select().from(tagSuggestions).all()
  const settings = getSettings(db)

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    app: BACKUP_APP_ID,
    appVersion,
    exportedAt: now(),
    data: {
      categories: cats,
      ledgerEntries: entries,
      entryTags: tags,
      tagSuggestions: suggestions,
      appSettings: settings ?? {
        id: APP_SETTINGS_ID,
        defaultCurrency: 'INR',
        pinSet: 0,
        biometricsEnabled: 0,
      },
    },
  }
}

/** Serialise a full backup to pretty JSON text ready to share/download. */
export function serializeBackup(db: AppDatabase, appVersion: string): string {
  return JSON.stringify(buildBackup(db, appVersion), null, 2)
}

export type ImportStrategy = 'replace' | 'merge'
export type ImportBackupOptions = { strategy: ImportStrategy }

/**
 * Restore a validated backup. Two strategies:
 *  - **replace** (destructive): wipe everything, then insert the backup verbatim — an exact
 *    reproduction of the source database (round-trip DoD). The device's LOCK flags
 *    (`pinSet` / `biometricsEnabled`) are PRESERVED, not taken from the backup: the PIN hash
 *    lives in `expo-secure-store` on THIS device (§5.1), so restoring another device's flags
 *    would risk locking the user out. `defaultCurrency` IS restored from the backup.
 *  - **merge** (non-destructive): insert rows whose id is not already present; existing ids are
 *    left untouched (skip-on-conflict) so a merge never clobbers local edits. A backup category
 *    whose id is new but whose (case-insensitive) name collides with an existing category is
 *    NOT duplicated — its entries are remapped onto the surviving category. Lock flags and
 *    `defaultCurrency` are left untouched on merge.
 */
export function importBackup(
  db: AppDatabase,
  backup: BackupFile,
  options: ImportBackupOptions
): void {
  if (options.strategy === 'replace') replaceAll(db, backup)
  else mergeAll(db, backup)
}

function replaceAll(db: AppDatabase, backup: BackupFile): void {
  // Capture the device's real lock state BEFORE wiping so we can restore it afterwards.
  const before = getSettings(db)
  const preservedPinSet = before?.pinSet ?? 0
  const preservedBiometrics = before?.biometricsEnabled ?? 0

  const { data } = backup
  // Wipe AND re-insert in a SINGLE transaction: if any insert fails — e.g. a hand-edited or
  // partially-corrupt backup that passes Zod SHAPE validation but violates a PK/FK constraint
  // (a duplicate id, or an entry pointing at a category not present in the backup) — the whole
  // thing rolls back and the user keeps their ORIGINAL data instead of being left with nothing.
  // The previous implementation wiped in one transaction and inserted in another, leaving a
  // data-loss window between them. We insert the backup verbatim rather than re-seeding, so the
  // result is an exact reproduction of the source (round-trip DoD). Deletes go child→parent and
  // inserts parent→child so the FK ordering holds whether or not PRAGMA foreign_keys is on.
  db.transaction((tx) => {
    tx.delete(entryTags).run()
    tx.delete(ledgerEntries).run()
    tx.delete(tagSuggestions).run()
    tx.delete(categories).run()
    tx.delete(appSettings).run()

    if (data.categories.length > 0) tx.insert(categories).values(data.categories).run()
    if (data.ledgerEntries.length > 0) tx.insert(ledgerEntries).values(data.ledgerEntries).run()
    if (data.entryTags.length > 0) tx.insert(entryTags).values(data.entryTags).run()
    if (data.tagSuggestions.length > 0) tx.insert(tagSuggestions).values(data.tagSuggestions).run()

    // Recreate the single settings row: currency FROM the backup, lock flags from THIS device
    // (the PIN hash lives in expo-secure-store on this device, §5.1 — restoring another
    // device's flags would risk locking the user out).
    tx.insert(appSettings)
      .values({
        id: APP_SETTINGS_ID,
        defaultCurrency: data.appSettings.defaultCurrency,
        pinSet: preservedPinSet,
        biometricsEnabled: preservedBiometrics,
      })
      .run()
  })
}

function mergeAll(db: AppDatabase, backup: BackupFile): void {
  const { data } = backup
  db.transaction((tx) => {
    // Build lookup maps of what already exists.
    const existingCats = tx.select().from(categories).all()
    const catById = new Map(existingCats.map((c) => [c.id, c]))
    const catByName = new Map(existingCats.map((c) => [c.name.toLowerCase(), c]))
    // backup category id -> the id it maps onto in the merged DB.
    const remap = new Map<string, string>()

    for (const c of data.categories) {
      if (catById.has(c.id)) {
        remap.set(c.id, c.id) // same id already present → keep existing
        continue
      }
      const nameHit = catByName.get(c.name.toLowerCase())
      if (nameHit) {
        remap.set(c.id, nameHit.id) // name collision under a different id → fold into existing
        continue
      }
      tx.insert(categories).values(c).run()
      catById.set(c.id, c)
      catByName.set(c.name.toLowerCase(), c)
      remap.set(c.id, c.id)
    }

    const existingEntryIds = new Set(
      tx
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .all()
        .map((r) => r.id)
    )
    const insertedEntryIds = new Set<string>()
    for (const e of data.ledgerEntries) {
      if (existingEntryIds.has(e.id)) continue // skip existing id (never clobber)
      const categoryId = remap.get(e.categoryId) ?? e.categoryId
      if (!catById.has(categoryId)) continue // orphan (no such category) → cannot satisfy FK
      tx.insert(ledgerEntries)
        .values({ ...e, categoryId })
        .run()
      insertedEntryIds.add(e.id)
    }

    // Only carry tags for entries we actually inserted; ignore tags for skipped/existing ids.
    for (const t of data.entryTags) {
      if (!insertedEntryIds.has(t.entryId)) continue
      tx.insert(entryTags).values(t).onConflictDoNothing().run()
    }

    // Tag suggestions: keep the most-recent last-used time.
    for (const s of data.tagSuggestions) {
      tx.insert(tagSuggestions)
        .values(s)
        .onConflictDoUpdate({
          target: tagSuggestions.tag,
          set: { lastUsedAt: sql`max(${tagSuggestions.lastUsedAt}, excluded.last_used_at)` },
        })
        .run()
    }
    // appSettings intentionally untouched on merge.
  })
}

// ---------------------------------------------------------------------------
// CSV (entries only, excludes soft-deleted)
// ---------------------------------------------------------------------------

/** Delimiter used to join/split an entry's tags inside the single CSV `tags` cell. */
export const CSV_TAG_DELIMITER = '|'

/** The canonical CSV column order this app writes and reads. */
export const CSV_HEADER = [
  'date',
  'title',
  'amount',
  'currency',
  'category',
  'tags',
  'description',
] as const

/**
 * Format a signed minor-unit amount for the CSV `amount` column: debit → bare positive number,
 * credit → leading "+". Uses the currency's minor-unit precision (§6.1), never a hardcoded ×100.
 */
export function formatCsvAmount(amountMinor: number, currency: string): string {
  const digits = minorUnitExponent(currency)
  const magnitude = (Math.abs(amountMinor) / 10 ** digits).toFixed(digits)
  return amountMinor < 0 ? magnitude : `+${magnitude}`
}

/**
 * Parse a CSV `amount` cell to signed minor units, or null if invalid/zero. A leading "+" means
 * credit (positive); a bare number or leading "-" means debit (negative), the expense default.
 */
export function parseCsvAmount(cell: string, currency: string): number | null {
  const trimmed = cell.trim()
  if (trimmed === '') return null
  const isCredit = trimmed.startsWith('+')
  const magnitude = parseAmountInput(trimmed, currency) // strips the sign; returns magnitude >= 0
  if (magnitude === null || magnitude === 0) return null
  return isCredit ? magnitude : -magnitude
}

/** Split a CSV tags cell on {@link CSV_TAG_DELIMITER}; trims and drops empty pieces. */
function parseCsvTags(cell: string): string[] {
  return cell
    .split(CSV_TAG_DELIMITER)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

/** Export all non-deleted entries (§6.7) as CSV text in the documented column format. */
export function exportEntriesCsv(db: AppDatabase): string {
  const entries = listEntries(db) // excludes soft-deleted; unbounded (no limit) for a full export
  const rows: string[][] = [[...CSV_HEADER]]
  for (const e of entries) {
    const cat = getCategoryById(db, e.categoryId)
    // Neutralise formula injection on the free-text columns only (not the numeric amount,
    // whose leading "+" credit marker must survive round-trip). Reversed on import below.
    rows.push([
      e.occurredOn,
      escapeCsvInjection(e.title),
      formatCsvAmount(e.amountMinor, e.currency),
      e.currency,
      escapeCsvInjection(cat?.name ?? ''),
      escapeCsvInjection(e.tags.join(CSV_TAG_DELIMITER)),
      escapeCsvInjection(e.description ?? ''),
    ])
  }
  return stringifyCsv(rows)
}

export type CsvRowError = { row: number; reason: string }
export type CsvImportReport = {
  /** Rows written successfully. */
  imported: number
  /** Rows rejected as invalid (with reasons in {@link errors}). */
  skipped: number
  /** Rows skipped because an identical entry already exists (date+title+amount+currency). */
  duplicates: number
  /** Data rows considered (excludes the header and fully-blank rows). */
  total: number
  /** Per-row failure detail for the visible success/skip summary (§8 Phase 7 DoD). */
  errors: CsvRowError[]
}

export type ImportCsvOptions = {
  /** Currency assumed when a row's `currency` cell is blank (from app_settings). */
  defaultCurrency: string
  /** Category name used when a row's `category` cell is blank. Default 'Miscellaneous'. */
  fallbackCategory?: string
}

/**
 * Content identity used to skip re-imported duplicates: `date + title + amount + currency`.
 * Category is deliberately EXCLUDED — it is a mutable classification, not part of a
 * transaction's identity, so re-importing after a category-mapping change still matches.
 * Title is compared case-insensitively and currency case-folded (ISO codes are case-blind);
 * amount is the signed minor-unit integer. Fields are joined on NUL to avoid cross-field
 * collisions.
 */
function entryDedupKey(
  occurredOn: string,
  title: string,
  amountMinor: number,
  currency: string
): string {
  return [
    occurredOn.trim(),
    title.trim().toLowerCase(),
    String(amountMinor),
    currency.trim().toUpperCase(),
  ].join(' ')
}

/** Find-or-create a category by name (case-insensitive), reactivating an inactive match (§6.4). */
function ensureCategory(db: AppDatabase, name: string): string {
  const existing = findCategoryByName(db, name)
  if (existing) {
    if (existing.active === 0) reactivateCategory(db, existing.id)
    return existing.id
  }
  return createCategory(db, { name }).id
}

/**
 * Import entries from CSV in the documented format. Auto-creates missing categories, validates
 * each row through the same schema/repo as the entry form (`createEntry` → `entryInputSchema`),
 * and returns a per-row success/skip report instead of silently dropping bad rows. Each good
 * row is committed independently (createEntry opens its own transaction), so one bad row never
 * rolls back the rows around it. Throws only when the header itself is unusable.
 *
 * Idempotent: a row whose `date+title+amount+currency` already matches a LIVE entry (or an
 * earlier row in the same file) is skipped and counted under `duplicates` — re-importing the
 * same file adds nothing. See {@link entryDedupKey} for the exact identity rule.
 */
export function importEntriesCsv(
  db: AppDatabase,
  csvText: string,
  options: ImportCsvOptions
): CsvImportReport {
  const report: CsvImportReport = { imported: 0, skipped: 0, duplicates: 0, total: 0, errors: [] }
  const matrix = parseCsv(csvText)
  // Empty / whitespace-only file → nothing to do (not an error).
  if (!matrix.some((row) => row.some((cell) => cell.trim() !== ''))) return report

  const header = matrix[0].map((h) => h.trim().toLowerCase())
  const colOf = (name: string) => header.indexOf(name)
  const idx = {
    date: colOf('date'),
    title: colOf('title'),
    amount: colOf('amount'),
    currency: colOf('currency'),
    category: colOf('category'),
    tags: colOf('tags'),
    description: colOf('description'),
  }
  if (idx.date < 0 || idx.title < 0 || idx.amount < 0) {
    throw new Error(
      'The CSV needs a header row with at least "date", "title", and "amount" columns.'
    )
  }

  const fallbackCategory = options.fallbackCategory ?? 'Miscellaneous'
  const dataRows = matrix.slice(1)

  // Dedup set seeded from existing LIVE entries (soft-deleted rows are intentionally ignored,
  // so a re-import never silently resurrects or re-skips something the user deleted). Keys of
  // rows we write are added as we go, so duplicates WITHIN a single file are caught too.
  const seenKeys = new Set<string>()
  for (const e of db
    .select({
      occurredOn: ledgerEntries.occurredOn,
      title: ledgerEntries.title,
      amountMinor: ledgerEntries.amountMinor,
      currency: ledgerEntries.currency,
    })
    .from(ledgerEntries)
    .where(isNull(ledgerEntries.deletedAt))
    .all()) {
    seenKeys.add(entryDedupKey(e.occurredOn, e.title, e.amountMinor, e.currency))
  }

  for (let i = 0; i < dataRows.length; i++) {
    const rowNum = i + 2 // 1-based, +1 for the header row
    const cells = dataRows[i]
    const cell = (j: number) => (j >= 0 && j < cells.length ? cells[j].trim() : '')

    const date = cell(idx.date)
    // Reverse the export-side injection guard on free-text columns (a no-op for CSVs from
    // other sources that were never escaped, unless a value literally starts with "'=" etc.).
    const title = unescapeCsvInjection(cell(idx.title))
    const amountCell = cell(idx.amount)
    const categoryName = unescapeCsvInjection(cell(idx.category))
    const tagsCell = unescapeCsvInjection(cell(idx.tags))
    const description = unescapeCsvInjection(cell(idx.description))
    const currency = cell(idx.currency) || options.defaultCurrency

    // A completely blank line (e.g. a stray delimiter row) is ignored, not counted.
    if (!date && !title && !amountCell && !categoryName && !tagsCell && !description) continue

    report.total++
    try {
      if (!isValidISODate(date)) {
        throw new Error(date ? `invalid date "${date}" (expected YYYY-MM-DD)` : 'missing date')
      }
      if (!title) throw new Error('missing title')
      const amountMinor = parseCsvAmount(amountCell, currency)
      if (amountMinor === null) {
        throw new Error(amountCell ? `invalid amount "${amountCell}"` : 'missing amount')
      }
      // Skip rows identical (date+title+amount+currency) to an existing or already-imported
      // entry, so re-importing the same file is idempotent and never duplicates.
      const dedupKey = entryDedupKey(date, title, amountMinor, currency)
      if (seenKeys.has(dedupKey)) {
        report.duplicates++
        continue
      }
      const categoryId = ensureCategory(db, categoryName || fallbackCategory)
      createEntry(db, {
        title,
        description: description || undefined,
        categoryId,
        amountMinor,
        currency,
        occurredOn: date,
        tags: parseCsvTags(tagsCell),
      })
      seenKeys.add(dedupKey)
      report.imported++
    } catch (e) {
      report.skipped++
      report.errors.push({ row: rowNum, reason: e instanceof Error ? e.message : String(e) })
    }
  }

  return report
}
