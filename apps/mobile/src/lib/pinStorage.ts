/**
 * PIN storage abstraction (§8 Phase 2).
 *
 * One interface, two backends, selected by `Platform.OS`:
 *  - **native (ios/android):** `expo-secure-store` — the PIN hash sits behind the OS
 *    keystore/keychain. `expo-secure-store` is NATIVE-ONLY and throws on web.
 *  - **web:** `localStorage` — a **convenience gate, not a security boundary**: the value
 *    is readable via browser devtools (see master-plan §1 "platform reality" and pinHash's
 *    note). We still store only a salted hash, never the raw PIN.
 *
 * Only a hashed {@link PinRecord} (JSON string) is ever written — see {@link ./pinHash}.
 */
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

import { createPinRecord, parsePinRecord, serializePinRecord, verifyPinAgainst } from './pinHash'
import { NO_LOCKOUT, nextLockout, parseLockoutRecord, type LockoutRecord } from './pinLockout'

/** The key under which the serialised {@link PinRecord} lives in either backend. */
export const PIN_STORAGE_KEY = 'expense-manager.pin.v1'

/** The key under which the failed-attempt {@link LockoutRecord} lives (§ brute-force guard). */
export const PIN_ATTEMPTS_KEY = 'expense-manager.pin-attempts.v1'

/** Minimal async, KEYED key/value contract both backends implement. */
export type PinStorageBackend = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}

/**
 * Native backend. `expo-secure-store` is native-only: importing it on web is harmless (it
 * only throws when a method is CALLED), and on web {@link selectBackend} picks the web
 * backend, so these methods never run there.
 */
export const nativeBackend: PinStorageBackend = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
}

/** Web backend over `localStorage`. Guards against SSR/non-DOM environments. */
export const webBackend: PinStorageBackend = {
  async getItem(key) {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  },
  async setItem(key, value) {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, value)
  },
  async removeItem(key) {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(key)
  },
}

/** Pick the backend for a platform. Pure — exported so tests can assert the mapping. */
export function selectBackend(os: typeof Platform.OS): PinStorageBackend {
  return os === 'web' ? webBackend : nativeBackend
}

let backend: PinStorageBackend = selectBackend(Platform.OS)

/**
 * Test seam: swap the storage backend (e.g. an in-memory fake) so PIN service logic can be
 * exercised without mocking Platform/SecureStore globally. Returns a restore function.
 */
export function _setBackendForTests(next: PinStorageBackend): () => void {
  const prev = backend
  backend = next
  return () => {
    backend = prev
  }
}

// ---- High-level PIN service (composes hashing + the selected backend) --------------------

/** True if a PIN has been set on this device (i.e. a hash record exists). */
export async function hasStoredPin(): Promise<boolean> {
  return parsePinRecord(await backend.getItem(PIN_STORAGE_KEY)) !== null
}

/**
 * Hash and persist a new/changed PIN. Throws via {@link createPinRecord} if malformed.
 * A successful save resets the failed-attempt counter — a freshly (re)set PIN starts clean.
 */
export async function savePin(pin: string): Promise<void> {
  const record = await createPinRecord(pin)
  await backend.setItem(PIN_STORAGE_KEY, serializePinRecord(record))
  await clearFailedAttempts()
}

/** Verify a candidate PIN against the stored hash. False if no PIN is set. */
export async function verifyPin(pin: string): Promise<boolean> {
  const record = parsePinRecord(await backend.getItem(PIN_STORAGE_KEY))
  if (!record) return false
  return verifyPinAgainst(pin, record)
}

/** Remove the stored PIN entirely (used by the forgot-PIN "wipe & start over" path). */
export async function clearStoredPin(): Promise<void> {
  await backend.removeItem(PIN_STORAGE_KEY)
  await clearFailedAttempts()
}

// ---- Failed-attempt throttling (§ brute-force guard; see ./pinLockout) --------------------

/** Read the persisted lockout record (safe default when absent/corrupt). */
export async function getLockoutRecord(): Promise<LockoutRecord> {
  return parseLockoutRecord(await backend.getItem(PIN_ATTEMPTS_KEY))
}

/**
 * Record one failed PIN attempt occurring at `now` and persist the updated record so the
 * throttle survives an app relaunch. Returns the new record (with any resulting `lockedUntil`).
 */
export async function recordFailedAttempt(now: number): Promise<LockoutRecord> {
  const next = nextLockout(await getLockoutRecord(), now)
  await backend.setItem(PIN_ATTEMPTS_KEY, JSON.stringify(next))
  return next
}

/** Clear the failed-attempt counter (called on a successful unlock or PIN reset). */
export async function clearFailedAttempts(): Promise<void> {
  await backend.removeItem(PIN_ATTEMPTS_KEY)
}

/** The clean, no-failures record — re-exported for callers that need a default. */
export { NO_LOCKOUT }
