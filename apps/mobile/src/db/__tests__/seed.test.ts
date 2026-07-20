import { count } from 'drizzle-orm'

import { getSettings } from '@/data'
import { APP_SETTINGS_ID, appSettings, categories } from '@/db/schema'
import { DEFAULT_SEED_CURRENCY, SEED_CATEGORY_NAMES, seedDatabase } from '@/db/seed'
import { createTestDatabase, type TestDatabase } from './testDb'

describe('seedDatabase — idempotency (§6.5)', () => {
  let h: TestDatabase
  beforeEach(() => {
    h = createTestDatabase()
  })
  afterEach(() => h.close())

  it('seeds all preloaded categories with is_preloaded=1 and the settings row', () => {
    seedDatabase(h.db)
    const rows = h.db.select().from(categories).all()
    expect(rows).toHaveLength(SEED_CATEGORY_NAMES.length)
    expect(rows.every((r) => r.isPreloaded === 1 && r.active === 1)).toBe(true)

    // No currency supplied → the neutral fallback default (the app is multi-currency).
    const settings = getSettings(h.db)
    expect(settings).toMatchObject({
      id: APP_SETTINGS_ID,
      defaultCurrency: DEFAULT_SEED_CURRENCY,
      pinSet: 0,
    })
  })

  it('seeds the settings row with the provided default currency', () => {
    seedDatabase(h.db, { defaultCurrency: 'EUR' })
    expect(getSettings(h.db)).toMatchObject({ defaultCurrency: 'EUR' })
  })

  it('running the seed twice does NOT duplicate rows', () => {
    seedDatabase(h.db)
    seedDatabase(h.db)
    const [{ value: catCount }] = h.db.select({ value: count() }).from(categories).all()
    const [{ value: settingsCount }] = h.db.select({ value: count() }).from(appSettings).all()
    expect(catCount).toBe(SEED_CATEGORY_NAMES.length)
    expect(settingsCount).toBe(1)
  })
})
