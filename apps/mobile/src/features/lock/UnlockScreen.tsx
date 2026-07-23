import { useCallback, useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'

import { Button, Input, Screen } from '@/components'
import { authenticateWithBiometrics } from '@/lib/biometrics'
import { attemptsRemaining } from '@/lib/pinLockout'
import { PIN_MAX_LENGTH } from '@/lib/pinHash'
import {
  clearFailedAttempts,
  getLockoutRecord,
  recordFailedAttempt,
  verifyPin,
} from '@/lib/pinStorage'

import { useLockStore } from './lockStore'

export type UnlockScreenProps = {
  /** Navigate to the forgot-PIN flow. */
  onForgot: () => void
}

/** Human-friendly "Xm Ys" / "Xs" from a millisecond remaining-lockout duration. */
function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

/**
 * Unlock flow (§7.1 / §8): enter the correct PIN, or use biometrics if enabled (with PIN
 * always available as fallback). Shown by {@link LockGate} whenever the app is locked.
 *
 * Failed PIN attempts are throttled (§ brute-force guard): after a few tries an escalating
 * lockout blocks further attempts, and the counter is persisted so it survives an app kill.
 * Biometrics stay available during a PIN lockout — that's strong auth, not a brute-forceable
 * guess — and a successful unlock of either kind clears the counter.
 */
export function UnlockScreen({ onForgot }: UnlockScreenProps) {
  const unlock = useLockStore((s) => s.unlock)
  const biometricsEnabled = useLockStore((s) => s.biometricsEnabled)

  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const biometricTried = useRef(false)

  // Persisted lockout expiry (epoch ms) + a ticking clock so the countdown re-renders.
  const [lockedUntil, setLockedUntil] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const lockRemaining = Math.max(0, lockedUntil - nowMs)
  const lockedOut = lockRemaining > 0

  // Seed the lockout state from storage on mount (a relaunch mid-lockout stays locked out).
  useEffect(() => {
    let active = true
    getLockoutRecord().then((r) => {
      if (active) setLockedUntil(r.lockedUntil)
    })
    return () => {
      active = false
    }
  }, [])

  // Tick once a second only while a lockout is active, to drive the countdown / re-enable.
  useEffect(() => {
    if (!lockedOut) return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [lockedOut])

  const onUnlocked = useCallback(async () => {
    await clearFailedAttempts()
    setLockedUntil(0)
    unlock()
  }, [unlock])

  const tryBiometric = useCallback(async () => {
    setBusy(true)
    try {
      const ok = await authenticateWithBiometrics('Unlock Kept')
      if (ok) await onUnlocked()
    } finally {
      setBusy(false)
    }
  }, [onUnlocked])

  // Offer biometrics automatically on first mount when enabled; PIN stays available.
  useEffect(() => {
    if (biometricsEnabled && !biometricTried.current) {
      biometricTried.current = true
      void tryBiometric()
    }
  }, [biometricsEnabled, tryBiometric])

  async function submitPin() {
    if (Date.now() < lockedUntil) return // defensive: ignore submits during a lockout
    setBusy(true)
    try {
      if (await verifyPin(pin)) {
        await onUnlocked()
      } else {
        const now = Date.now()
        const rec = await recordFailedAttempt(now)
        setLockedUntil(rec.lockedUntil)
        setNowMs(now)
        setPin('')
        if (rec.lockedUntil > now) {
          setError(`Too many attempts. Try again in ${formatCountdown(rec.lockedUntil - now)}.`)
        } else {
          const left = attemptsRemaining(rec)
          setError(
            left <= 2
              ? `Incorrect PIN. ${left} attempt${left === 1 ? '' : 's'} left.`
              : 'Incorrect PIN. Try again.'
          )
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const inputDisabled = busy || lockedOut

  return (
    <Screen contentClassName="justify-center gap-6">
      <View className="gap-2">
        <Text className="text-2xl font-semibold text-fg">Welcome back</Text>
        <Text className="text-sm text-muted">
          {lockedOut ? 'Too many attempts — unlocking is paused.' : 'Enter your PIN to unlock.'}
        </Text>
      </View>

      <Input
        label="PIN"
        value={pin}
        onChangeText={(t) => {
          setPin(t.replace(/\D/g, ''))
          if (error) setError(undefined)
        }}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={PIN_MAX_LENGTH}
        autoFocus
        editable={!inputDisabled}
        error={lockedOut ? `Locked. Try again in ${formatCountdown(lockRemaining)}.` : error}
        onSubmitEditing={submitPin}
        accessibilityLabel="Enter PIN"
        testID="unlock-pin-input"
      />

      <View className="gap-3">
        <Button
          label={lockedOut ? `Locked (${formatCountdown(lockRemaining)})` : 'Unlock'}
          onPress={submitPin}
          loading={busy}
          disabled={inputDisabled || pin.length === 0}
          fullWidth
          testID="unlock-submit"
        />
        {biometricsEnabled ? (
          <Button
            label="Use biometrics"
            variant="secondary"
            onPress={tryBiometric}
            disabled={busy}
            fullWidth
            testID="unlock-biometrics"
          />
        ) : null}
        <Button
          label="Forgot PIN?"
          variant="ghost"
          onPress={onForgot}
          disabled={busy}
          fullWidth
          testID="unlock-forgot"
        />
      </View>
    </Screen>
  )
}
