import {
  completePinSetup,
  setBiometricsEnabled,
  setNewPin,
  wipeAndStartOver,
} from '@/features/lock/lockActions'
import { createEntry, createCategory, getSettings } from '@/data'
import { seedDatabase } from '@/db/seed'
import { ledgerEntries } from '@/db/schema'
import { createTestDatabase, type TestDatabase } from '@/db/__tests__/testDb'
import {
  _setBackendForTests,
  hasStoredPin,
  verifyPin,
  type PinStorageBackend,
} from '@/lib/pinStorage'

/** In-memory KEYED PIN backend so composition runs without SecureStore/localStorage. */
function createMemoryBackend(): PinStorageBackend {
  const mem = new Map<string, string>()
  return {
    getItem: async (key) => mem.get(key) ?? null,
    setItem: async (key, value) => void mem.set(key, value),
    removeItem: async (key) => void mem.delete(key),
  }
}

describe('lockActions (§8 setup + forgot-PIN composition)', () => {
  let h: TestDatabase
  let restore: () => void
  beforeEach(() => {
    h = createTestDatabase()
    seedDatabase(h.db)
    restore = _setBackendForTests(createMemoryBackend())
  })
  afterEach(() => {
    restore()
    h.close()
  })

  it('completePinSetup stores the hash and flips the settings flags', async () => {
    await completePinSetup(h.db, '1234', true)
    expect(await hasStoredPin()).toBe(true)
    expect(await verifyPin('1234')).toBe(true)
    expect(getSettings(h.db)).toMatchObject({ pinSet: 1, biometricsEnabled: 1 })
  })

  it('completePinSetup without biometrics leaves that flag off', async () => {
    await completePinSetup(h.db, '1234', false)
    expect(getSettings(h.db)).toMatchObject({ pinSet: 1, biometricsEnabled: 0 })
  })

  it('setNewPin replaces the PIN (old fails, new works) and keeps pin_set', async () => {
    await completePinSetup(h.db, '1111', false)
    await setNewPin(h.db, '2222')
    expect(await verifyPin('1111')).toBe(false)
    expect(await verifyPin('2222')).toBe(true)
    expect(getSettings(h.db)).toMatchObject({ pinSet: 1 })
  })

  it('setBiometricsEnabled toggles the settings flag', async () => {
    await completePinSetup(h.db, '1234', false)
    setBiometricsEnabled(h.db, true)
    expect(getSettings(h.db)).toMatchObject({ biometricsEnabled: 1 })
    setBiometricsEnabled(h.db, false)
    expect(getSettings(h.db)).toMatchObject({ biometricsEnabled: 0 })
  })

  it('wipeAndStartOver clears the PIN and erases data (returns to first-run)', async () => {
    const categoryId = createCategory(h.db, { name: 'Custom' }).id
    createEntry(h.db, {
      title: 'Coffee',
      categoryId,
      amountMinor: -300,
      currency: 'INR',
      occurredOn: '2026-07-04',
      tags: [],
    })
    await completePinSetup(h.db, '1234', true)

    await wipeAndStartOver(h.db)

    expect(await hasStoredPin()).toBe(false)
    expect(await verifyPin('1234')).toBe(false)
    expect(h.db.select().from(ledgerEntries).all()).toHaveLength(0)
    expect(getSettings(h.db)).toMatchObject({ pinSet: 0, biometricsEnabled: 0 })
  })
})
