import '../global.css'

import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { getDatabase, warmUpDatabaseAsync } from '@/db/client'
import { purgeDeletedEntries } from '@/data'
import migrations from '@/db/migrations/migrations'
import { seedDatabase } from '@/db/seed'
import { getDeviceDefaultCurrency } from '@/lib/deviceCurrency'
import { LockGate } from '@/features/lock'
import { useThemeColors } from '@/theme/useThemeColors'

/** Full-screen gate shown while the DB boots or if it fails. */
function Gate({ title, detail, busy }: { title: string; detail?: string; busy?: boolean }) {
  const colors = useThemeColors()
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-bg px-6">
      {busy ? <ActivityIndicator color={colors.primary} /> : null}
      <Text className="text-center text-lg font-semibold text-fg">{title}</Text>
      {detail ? <Text className="text-center text-sm text-danger">{detail}</Text> : null}
    </View>
  )
}

/**
 * Applies Drizzle migrations on boot (§3). Rendered only AFTER the DB worker is warm,
 * so its synchronous ops are safe on web (see warmUpDatabaseAsync). Hook rules require
 * useMigrations to be called unconditionally, hence this separate component.
 */
function MigratedApp() {
  const { success, error } = useMigrations(getDatabase(), migrations)

  // Seed once, after migrations have created the tables (§6.5). seedDatabase is idempotent,
  // so it is safe on every boot; the ref avoids re-running each render. It runs in a
  // microtask so its state updates land in callbacks (not synchronously in the effect), and
  // we gate rendering on `seedState` so the first launch never flashes an unseeded DB.
  const [seedState, setSeedState] = useState<'pending' | 'done' | { error: string }>('pending')
  const seeded = useRef(false)
  useEffect(() => {
    if (!success || seeded.current) return
    seeded.current = true
    Promise.resolve()
      .then(() => {
        seedDatabase(getDatabase(), { defaultCurrency: getDeviceDefaultCurrency() })
        // Enforce the 30-day recovery window (§6.7): hard-delete soft-deleted entries whose
        // window has elapsed, so the DB doesn't grow unbounded. Housekeeping only — a failure
        // here must never block boot, so it's isolated from the seed's success path.
        try {
          purgeDeletedEntries(getDatabase())
        } catch {
          // ignore: purge is best-effort cleanup, not required for the app to run
        }
        setSeedState('done')
      })
      .catch((e) => setSeedState({ error: e instanceof Error ? e.message : String(e) }))
  }, [success])

  if (error) return <Gate title="Database migration failed" detail={error.message} />
  if (typeof seedState === 'object') {
    return <Gate title="Could not prepare initial data" detail={seedState.error} />
  }
  if (!success || seedState === 'pending') return <Gate title="Preparing your data…" busy />
  // DB is warm + migrated + seeded here. The lock gate sits INSIDE this readiness gate, so
  // the ordering is: DB ready → lock/unlock gate → the app's routes (§8).
  return (
    <LockGate>
      <Stack screenOptions={{ headerShown: false }} />
    </LockGate>
  )
}

export default function RootLayout() {
  // On web, the SQLite worker must be booted asynchronously before any synchronous op
  // (openDatabaseSync / migrations) runs — otherwise the first sync call times out.
  // No-op on native, so `warm` flips true immediately there.
  const [warm, setWarm] = useState(false)
  const [warmError, setWarmError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    warmUpDatabaseAsync()
      .then(() => active && setWarm(true))
      .catch((e) => active && setWarmError(e instanceof Error ? e.message : String(e)))
    return () => {
      active = false
    }
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        {warmError ? (
          <Gate title="Could not open the database" detail={warmError} />
        ) : !warm ? (
          <Gate title="Starting…" busy />
        ) : (
          <MigratedApp />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
