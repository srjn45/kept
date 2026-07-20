import { Platform } from 'react-native'

import {
  _setBackendForTests,
  clearFailedAttempts,
  clearStoredPin,
  getLockoutRecord,
  hasStoredPin,
  nativeBackend,
  PIN_STORAGE_KEY,
  recordFailedAttempt,
  savePin,
  selectBackend,
  verifyPin,
  webBackend,
  type PinStorageBackend,
} from '@/lib/pinStorage'
import { FREE_ATTEMPTS } from '@/lib/pinLockout'

// In-memory secure-store so the NATIVE backend can be exercised under Jest (the real native
// module can't run). Mirrors expo-secure-store's async API.
jest.mock('expo-secure-store', () => {
  const mem = new Map<string, string>()
  return {
    getItemAsync: jest.fn(async (k: string) => (mem.has(k) ? mem.get(k)! : null)),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      mem.set(k, v)
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      mem.delete(k)
    }),
  }
})

/** A minimal in-memory, KEYED backend for exercising the PIN service without a platform module. */
function createMemoryBackend(): PinStorageBackend {
  const mem = new Map<string, string>()
  return {
    getItem: async (key) => mem.get(key) ?? null,
    setItem: async (key, value) => void mem.set(key, value),
    removeItem: async (key) => void mem.delete(key),
  }
}

describe('pinStorage — backend selection (§8 native vs web)', () => {
  it('selects localStorage on web and secure-store on native', () => {
    expect(selectBackend('web')).toBe(webBackend)
    expect(selectBackend('ios')).toBe(nativeBackend)
    expect(selectBackend('android')).toBe(nativeBackend)
  })

  it('the default backend follows Platform.OS', () => {
    // jest-expo defaults Platform.OS to a native platform; assert selection is consistent.
    expect(selectBackend(Platform.OS)).toBe(Platform.OS === 'web' ? webBackend : nativeBackend)
  })
})

describe('webBackend (localStorage)', () => {
  const store = new Map<string, string>()
  beforeAll(() => {
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
  })
  afterAll(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
  })
  beforeEach(() => store.clear())

  it('round-trips a value under the given key', async () => {
    expect(await webBackend.getItem(PIN_STORAGE_KEY)).toBeNull()
    await webBackend.setItem(PIN_STORAGE_KEY, 'hello')
    expect(store.get(PIN_STORAGE_KEY)).toBe('hello')
    expect(await webBackend.getItem(PIN_STORAGE_KEY)).toBe('hello')
    await webBackend.removeItem(PIN_STORAGE_KEY)
    expect(await webBackend.getItem(PIN_STORAGE_KEY)).toBeNull()
  })
})

describe('nativeBackend (expo-secure-store)', () => {
  it('round-trips a value via the secure-store async API', async () => {
    expect(await nativeBackend.getItem(PIN_STORAGE_KEY)).toBeNull()
    await nativeBackend.setItem(PIN_STORAGE_KEY, 'secret')
    expect(await nativeBackend.getItem(PIN_STORAGE_KEY)).toBe('secret')
    await nativeBackend.removeItem(PIN_STORAGE_KEY)
    expect(await nativeBackend.getItem(PIN_STORAGE_KEY)).toBeNull()
  })
})

describe('PIN service (hash + storage composed)', () => {
  let restore: () => void
  beforeEach(() => {
    restore = _setBackendForTests(createMemoryBackend())
  })
  afterEach(() => restore())

  it('reports no PIN before one is set', async () => {
    expect(await hasStoredPin()).toBe(false)
    expect(await verifyPin('1234')).toBe(false)
  })

  it('saves a PIN, then verifies correct vs incorrect', async () => {
    await savePin('1234')
    expect(await hasStoredPin()).toBe(true)
    expect(await verifyPin('1234')).toBe(true)
    expect(await verifyPin('9999')).toBe(false)
  })

  it('savePin rejects an invalid PIN', async () => {
    await expect(savePin('12')).rejects.toThrow()
    expect(await hasStoredPin()).toBe(false)
  })

  it('clearStoredPin removes the PIN', async () => {
    await savePin('4321')
    await clearStoredPin()
    expect(await hasStoredPin()).toBe(false)
    expect(await verifyPin('4321')).toBe(false)
  })

  it('changing the PIN invalidates the old one', async () => {
    await savePin('1234')
    await savePin('5678')
    expect(await verifyPin('1234')).toBe(false)
    expect(await verifyPin('5678')).toBe(true)
  })
})

describe('failed-attempt throttling (§ brute-force guard)', () => {
  let restore: () => void
  beforeEach(() => {
    restore = _setBackendForTests(createMemoryBackend())
  })
  afterEach(() => restore())

  it('starts clean and persists an escalating counter', async () => {
    expect(await getLockoutRecord()).toEqual({ fails: 0, lockedUntil: 0 })

    for (let i = 1; i <= FREE_ATTEMPTS; i++) {
      const rec = await recordFailedAttempt(1_000)
      expect(rec.fails).toBe(i)
      expect(rec.lockedUntil).toBe(0) // still within the free allowance
    }
    // The first failure past the allowance imposes a lockout in the future.
    const locked = await recordFailedAttempt(1_000)
    expect(locked.fails).toBe(FREE_ATTEMPTS + 1)
    expect(locked.lockedUntil).toBeGreaterThan(1_000)
    // Persisted: a fresh read sees the same record.
    expect(await getLockoutRecord()).toEqual(locked)
  })

  it('clearFailedAttempts resets the counter', async () => {
    await recordFailedAttempt(1_000)
    await clearFailedAttempts()
    expect(await getLockoutRecord()).toEqual({ fails: 0, lockedUntil: 0 })
  })

  it('saving a PIN resets any prior failed attempts', async () => {
    await recordFailedAttempt(1_000)
    await recordFailedAttempt(1_000)
    await savePin('1234')
    expect(await getLockoutRecord()).toEqual({ fails: 0, lockedUntil: 0 })
  })

  it('a successful verify does NOT itself clear attempts (the screen does that)', async () => {
    await savePin('1234')
    await recordFailedAttempt(1_000)
    expect(await verifyPin('1234')).toBe(true)
    // verifyPin is pure-read; UnlockScreen calls clearFailedAttempts on success.
    expect((await getLockoutRecord()).fails).toBe(1)
  })
})
