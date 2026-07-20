/**
 * Failed-PIN throttling (§ security hardening).
 *
 * A 4–6 digit PIN is a tiny keyspace (10⁴–10⁶) and the stored hash is not real key-stretching
 * (see {@link ./pinHash}), so the UI must not allow unlimited guesses. After a handful of free
 * attempts we impose an escalating lockout. The counter is PERSISTED next to the PIN (see
 * {@link ./pinStorage}) so it survives an app kill/relaunch — an in-memory counter would reset
 * on every force-quit and defeat the point.
 *
 * This module is PURE timing math (no IO), so the backoff schedule is unit-tested with explicit
 * timestamps. The storage/reset wiring lives in `pinStorage`; the UI in `UnlockScreen`.
 */

/** Persisted throttle state. `lockedUntil` is an epoch-ms instant (0 = not locked). */
export type LockoutRecord = { fails: number; lockedUntil: number }

/** The clean, no-failures state. */
export const NO_LOCKOUT: LockoutRecord = { fails: 0, lockedUntil: 0 }

/** Consecutive failures allowed before any lockout begins. */
export const FREE_ATTEMPTS = 5

/**
 * Escalating lockout durations (ms) applied AFTER the free attempts are used up.
 * Index 0 = the first failure past the free allowance; the last value is the cap for all
 * further failures. 30s → 1m → 5m → 15m → 1h.
 */
const BACKOFF_MS = [30_000, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000]

/**
 * Fold one more failed attempt (occurring at `now`) into the current record.
 * Below the free allowance there's no lockout; past it, `lockedUntil` is `now` plus the
 * escalating backoff step (capped at the last entry).
 */
export function nextLockout(current: LockoutRecord, now: number): LockoutRecord {
  const fails = current.fails + 1
  if (fails <= FREE_ATTEMPTS) return { fails, lockedUntil: 0 }
  const step = Math.min(fails - FREE_ATTEMPTS, BACKOFF_MS.length) - 1
  return { fails, lockedUntil: now + BACKOFF_MS[step] }
}

/** Milliseconds of lockout still remaining at `now` (0 if unlocked). */
export function remainingLockoutMs(record: LockoutRecord, now: number): number {
  return Math.max(0, record.lockedUntil - now)
}

/** Free attempts still available before the next lockout (0 once past the allowance). */
export function attemptsRemaining(record: LockoutRecord): number {
  return Math.max(0, FREE_ATTEMPTS - record.fails)
}

/** Parse a persisted record, tolerating absent/corrupt values by returning {@link NO_LOCKOUT}. */
export function parseLockoutRecord(raw: string | null): LockoutRecord {
  if (!raw) return NO_LOCKOUT
  try {
    const v: unknown = JSON.parse(raw)
    if (
      typeof v === 'object' &&
      v !== null &&
      typeof (v as LockoutRecord).fails === 'number' &&
      typeof (v as LockoutRecord).lockedUntil === 'number'
    ) {
      return { fails: (v as LockoutRecord).fails, lockedUntil: (v as LockoutRecord).lockedUntil }
    }
  } catch {
    // fall through to the safe default
  }
  return NO_LOCKOUT
}
