/**
 * JSON backup envelope: schema, versioning, and validation (§8 Phase 7).
 *
 * A backup file is an envelope carrying a `schemaVersion` + the exporting app version around a
 * full dump of every table (categories, entries INCLUDING soft-deleted rows for full fidelity
 * per §6.7, the entry↔tag join, tag suggestions, and the settings row). The data-layer
 * (`src/data/backup.ts`) reads/writes the database; THIS module owns only the pure envelope
 * shape and its validation, so the version gate and row-shape checks are unit-testable without
 * a database.
 *
 * Versioning: MVP supports schemaVersion 1 only. The parse path is structured so a future
 * migration is obvious — add the old version to {@link SUPPORTED_SCHEMA_VERSIONS}, branch in
 * `parseBackupText`, and up-convert to the current shape before returning. Unknown/future
 * versions are rejected with a clear message rather than crashing or silently corrupting data.
 *
 * Pure TypeScript, no React/RN imports (see §4).
 */
import { z } from 'zod'

/** The schemaVersion this build writes and (for MVP) the only one it can import. */
export const BACKUP_SCHEMA_VERSION = 1 as const

/** Versions this build can import. Extend + add a migration branch when the shape changes. */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1]

/** File-type marker embedded in the envelope so we can reject unrelated JSON early. */
export const BACKUP_APP_ID = 'expense-manager'

// --- Row schemas (mirror the Drizzle tables in src/db/schema, kept pure here) ---

const categoryRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  isPreloaded: z.number().int(),
  active: z.number().int(),
  createdAt: z.number().int(),
})

const ledgerEntryRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  categoryId: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
  occurredOn: z.string(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  deletedAt: z.number().int().nullable(),
})

const entryTagRowSchema = z.object({
  entryId: z.string(),
  tag: z.string(),
})

const tagSuggestionRowSchema = z.object({
  tag: z.string(),
  lastUsedAt: z.number().int(),
})

const appSettingsRowSchema = z.object({
  id: z.number().int(),
  defaultCurrency: z.string(),
  pinSet: z.number().int(),
  biometricsEnabled: z.number().int(),
})

const backupDataSchema = z.object({
  categories: z.array(categoryRowSchema),
  ledgerEntries: z.array(ledgerEntryRowSchema),
  entryTags: z.array(entryTagRowSchema),
  tagSuggestions: z.array(tagSuggestionRowSchema),
  appSettings: appSettingsRowSchema,
})

/** The full envelope shape (a version-1 backup). */
export const backupFileSchema = z.object({
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  app: z.string(),
  appVersion: z.string(),
  exportedAt: z.number().int(),
  data: backupDataSchema,
})

export type BackupCategoryRow = z.infer<typeof categoryRowSchema>
export type BackupLedgerEntryRow = z.infer<typeof ledgerEntryRowSchema>
export type BackupEntryTagRow = z.infer<typeof entryTagRowSchema>
export type BackupTagSuggestionRow = z.infer<typeof tagSuggestionRowSchema>
export type BackupAppSettingsRow = z.infer<typeof appSettingsRowSchema>
export type BackupData = z.infer<typeof backupDataSchema>
export type BackupFile = z.infer<typeof backupFileSchema>

/** Discriminated result of {@link parseBackupText} — never throws, so the UI can show a message. */
export type BackupParseResult =
  | { ok: true; backup: BackupFile }
  | {
      ok: false
      code: 'invalid-json' | 'not-a-backup' | 'unsupported-version' | 'invalid-shape'
      message: string
    }

/**
 * Parse + validate raw JSON text into a {@link BackupFile}. Returns a typed result instead of
 * throwing so import UIs can surface a clear error. The version gate runs BEFORE the full shape
 * check so a future-versioned backup gets an accurate "unsupported version" message rather than
 * a confusing shape error.
 */
export function parseBackupText(text: string): BackupParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, code: 'invalid-json', message: 'This file is not valid JSON.' }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      code: 'not-a-backup',
      message: 'This file is not a Kept backup.',
    }
  }

  const version = (parsed as { schemaVersion?: unknown }).schemaVersion
  if (typeof version !== 'number') {
    return {
      ok: false,
      code: 'not-a-backup',
      message: 'This file is missing a schemaVersion — it is not a Kept backup.',
    }
  }
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(version)) {
    return {
      ok: false,
      code: 'unsupported-version',
      message: `This backup is version ${version}, which this app can't import (supported: ${SUPPORTED_SCHEMA_VERSIONS.join(
        ', '
      )}). Update the app and try again.`,
    }
  }

  const result = backupFileSchema.safeParse(parsed)
  if (!result.success) {
    const first = result.error.issues[0]
    const where = first?.path.join('.') || 'file'
    return {
      ok: false,
      code: 'invalid-shape',
      message: `This backup is corrupted or has an unexpected shape (at "${where}").`,
    }
  }

  return { ok: true, backup: result.data }
}
