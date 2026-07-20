/**
 * Lock IO orchestration (§8 Phase 2). Composes the PIN service (hash + storage), the
 * settings repo (the `pin_set` / `biometrics_enabled` flags — NEVER the hash), and the
 * destructive wipe. Kept separate from the Zustand store (which is pure state) and from the
 * screens (which own UI), so these flows are unit-testable end to end with only the storage
 * backend swapped for an in-memory fake.
 */
import { savePin, clearStoredPin } from '@/lib/pinStorage'
import { getDeviceDefaultCurrency } from '@/lib/deviceCurrency'
import { updateSettings, wipeAllData } from '@/data'
import type { AppDatabase } from '@/db/types'

/**
 * First-run completion: persist the hashed PIN and flip the settings flags. The PIN hash
 * lives only in secure storage; only the booleans go in SQLite (§5.1).
 */
export async function completePinSetup(
  db: AppDatabase,
  pin: string,
  enableBiometrics: boolean
): Promise<void> {
  await savePin(pin)
  updateSettings(db, { pinSet: true, biometricsEnabled: enableBiometrics })
}

/**
 * Set a brand-new PIN (change-PIN, or the biometric-verified forgot-PIN reset). Keeps
 * `pin_set = true`; does not touch the biometrics flag.
 */
export async function setNewPin(db: AppDatabase, pin: string): Promise<void> {
  await savePin(pin)
  updateSettings(db, { pinSet: true })
}

/**
 * Update whether biometric unlock is enabled (Settings toggle / setup offer). Persists to
 * `app_settings`; callers also update the store's `biometricsEnabled`.
 */
export function setBiometricsEnabled(db: AppDatabase, enabled: boolean): void {
  updateSettings(db, { biometricsEnabled: enabled })
}

/**
 * Forgot-PIN "wipe data & start over": clear the stored PIN hash AND erase + re-seed the
 * database. Afterwards `pin_set = 0` and no hash exists, so the app returns to first-run
 * PIN creation. Irreversible — guard behind an explicit confirmation in the UI.
 */
export async function wipeAndStartOver(db: AppDatabase): Promise<void> {
  wipeAllData(db, { defaultCurrency: getDeviceDefaultCurrency() })
  await clearStoredPin()
}
