/**
 * Destructive "wipe & start over" (§8 Phase 2, forgot-PIN path).
 *
 * Deletes ALL user data and re-seeds a fresh database (preloaded categories + a default
 * `app_settings` row with `pin_set = 0`). Callers pair this with `clearStoredPin()` so the
 * app returns to the first-run "create a PIN" state — never a silent dead end. There is no
 * server, so this is the only recovery when biometrics aren't enrolled.
 *
 * Framework-agnostic (injected {@link AppDatabase}); no UI/RN imports so it is unit-tested
 * against in-memory better-sqlite3 like the other repos.
 */
import { seedDatabase, type SeedOptions } from '@/db/seed'
import { appSettings, categories, entryTags, ledgerEntries, tagSuggestions } from '@/db/schema'
import type { AppDatabase } from '@/db/types'

/**
 * Delete every row from every table, then re-seed. Runs in one transaction. Child rows are
 * deleted before their parents so this works whether or not `PRAGMA foreign_keys` is on.
 *
 * `options` is forwarded to {@link seedDatabase} so a forgot-PIN wipe can re-seed with the
 * device's detected default currency (like a fresh install) rather than a fixed code.
 */
export function wipeAllData(db: AppDatabase, options: SeedOptions = {}): void {
  db.transaction((tx) => {
    tx.delete(entryTags).run()
    tx.delete(ledgerEntries).run()
    tx.delete(tagSuggestions).run()
    tx.delete(categories).run()
    tx.delete(appSettings).run()
  })
  // Re-seed outside the delete transaction (seedDatabase opens its own transaction).
  seedDatabase(db, options)
}
