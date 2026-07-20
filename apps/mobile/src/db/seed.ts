/**
 * Idempotent database seed (§6.5): the preloaded categories and the single `app_settings`
 * row. Safe to run on every boot — running it twice never duplicates rows. Framework-
 * agnostic (injected {@link AppDatabase}); a later phase wires the boot-time call.
 */
import { sql } from 'drizzle-orm'

import { now } from '@/domain/dates'
import { APP_SETTINGS_ID, appSettings, categories } from '@/db/schema'
import type { AppDatabase } from '@/db/types'

/** Preloaded categories, seeded with `is_preloaded = 1` on first init (§6.5). */
export const SEED_CATEGORY_NAMES = [
  'Food & Dining',
  'Groceries',
  'Transport',
  'Rent',
  'Utilities',
  'Health',
  'Entertainment',
  'Shopping',
  'Education',
  'Travel',
  'Subscriptions',
  'Income',
  'Miscellaneous',
] as const

/** Stable id for a preloaded category so re-seeding is deterministic. */
function preloadedId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `preloaded-${slug}`
}

/**
 * Fallback seeded currency when the caller doesn't supply one (e.g. tests, or a platform
 * with no device locale). The app is multi-currency; production callers pass the device's
 * detected currency via {@link getDeviceDefaultCurrency}. USD is a neutral default.
 */
export const DEFAULT_SEED_CURRENCY = 'USD'

/** Options for {@link seedDatabase}. */
export type SeedOptions = {
  /**
   * ISO 4217 code seeded into the single `app_settings` row on first init. Only applied when
   * the settings row doesn't already exist (idempotent). Defaults to {@link DEFAULT_SEED_CURRENCY}.
   */
  defaultCurrency?: string
}

/**
 * Seed preloaded categories + the default settings row. Idempotent:
 *  - each category is inserted by a stable id AND skipped if any category already has that
 *    (case-insensitive) name, so a user-renamed/reactivated preloaded row is never dup'd;
 *  - the settings row uses a fixed id (1) with `onConflictDoNothing`.
 * Runs in a single transaction.
 */
export function seedDatabase(db: AppDatabase, options: SeedOptions = {}): void {
  const ts = now()
  const defaultCurrency = options.defaultCurrency ?? DEFAULT_SEED_CURRENCY
  db.transaction((tx) => {
    for (const name of SEED_CATEGORY_NAMES) {
      const exists = tx
        .select({ id: categories.id })
        .from(categories)
        .where(sql`lower(${categories.name}) = lower(${name})`)
        .get()
      if (exists) continue
      tx.insert(categories)
        .values({
          id: preloadedId(name),
          name,
          color: null,
          icon: null,
          isPreloaded: 1,
          active: 1,
          createdAt: ts,
        })
        .onConflictDoNothing()
        .run()
    }

    tx.insert(appSettings)
      .values({ id: APP_SETTINGS_ID, defaultCurrency, pinSet: 0, biometricsEnabled: 0 })
      .onConflictDoNothing()
      .run()
  })
}
