import {
  createCategory,
  createEntry,
  getSettings,
  listCategories,
  updateSettings,
  wipeAllData,
} from '@/data'
import { SEED_CATEGORY_NAMES, seedDatabase } from '@/db/seed'
import { entryTags, ledgerEntries, tagSuggestions } from '@/db/schema'
import { createTestDatabase, type TestDatabase } from '@/db/__tests__/testDb'

describe('wipeAllData (§8 forgot-PIN "start over")', () => {
  let h: TestDatabase
  beforeEach(() => {
    h = createTestDatabase()
    seedDatabase(h.db)
  })
  afterEach(() => h.close())

  it('erases all user data and re-seeds a fresh database', () => {
    const categoryId = createCategory(h.db, { name: 'Custom' }).id
    createEntry(h.db, {
      title: 'Lunch',
      categoryId,
      amountMinor: -500,
      currency: 'INR',
      occurredOn: '2026-07-04',
      tags: ['food'],
    })
    updateSettings(h.db, { pinSet: true, biometricsEnabled: true, defaultCurrency: 'USD' })

    wipeAllData(h.db)

    // Entries, tags, and the custom category are gone.
    expect(h.db.select().from(ledgerEntries).all()).toHaveLength(0)
    expect(h.db.select().from(entryTags).all()).toHaveLength(0)
    expect(h.db.select().from(tagSuggestions).all()).toHaveLength(0)
    expect(listCategories(h.db).some((c) => c.name === 'Custom')).toBe(false)

    // Preloaded categories are re-seeded and settings reset to defaults (pin_set = 0).
    expect(listCategories(h.db)).toHaveLength(SEED_CATEGORY_NAMES.length)
    const settings = getSettings(h.db)
    expect(settings).toMatchObject({ pinSet: 0, biometricsEnabled: 0, defaultCurrency: 'USD' })
  })

  it('re-seeds with the provided default currency (device-detected on a real wipe)', () => {
    wipeAllData(h.db, { defaultCurrency: 'GBP' })
    expect(getSettings(h.db)).toMatchObject({ defaultCurrency: 'GBP' })
  })
})
