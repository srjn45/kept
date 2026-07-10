import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useReducer } from 'react'

import { getSettings } from '@/data'
import { getDatabase } from '@/db/client'

import { SettingsManager } from './SettingsManager'
import { exportFile, pickTextFile } from './fileIo'

/**
 * Route-level Settings screen (§7.5 · §8 Phase 7). The ONLY piece here that touches expo-sqlite
 * and platform file I/O; it delegates all UI + backup logic to the pure, DB-injected
 * {@link SettingsManager} (unit-testable under Jest with injected file callbacks).
 *
 * `exportFile` / `pickTextFile` are resolved by Metro per platform (native share sheet vs web
 * download — see fileIo.ts / fileIo.web.ts). `onChanged` bumps a local signal after an import so
 * this route is consistent; the LEDGER re-reads on focus (see LedgerScreen) so returning to it
 * after a bulk restore/CSV import shows the new data live, even on web where expo-sqlite's WASM
 * change-listener stays silent for bulk writes (§8 reactivity note).
 */
export function SettingsScreen() {
  const db = getDatabase()
  const [, refresh] = useReducer((n: number) => n + 1, 0)

  const defaultCurrency = getSettings(db)?.defaultCurrency ?? 'INR'
  const appVersion = Constants.expoConfig?.version ?? '1.0.0'

  return (
    <SettingsManager
      db={db}
      appVersion={appVersion}
      defaultCurrency={defaultCurrency}
      onChanged={refresh}
      onBack={() => router.back()}
      exportFile={exportFile}
      pickTextFile={pickTextFile}
    />
  )
}
