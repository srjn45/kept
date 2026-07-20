import {
  attemptsRemaining,
  FREE_ATTEMPTS,
  NO_LOCKOUT,
  nextLockout,
  parseLockoutRecord,
  remainingLockoutMs,
} from '@/lib/pinLockout'

describe('pinLockout — escalating backoff (§ brute-force guard)', () => {
  it('imposes no lockout within the free allowance', () => {
    let rec = NO_LOCKOUT
    for (let i = 1; i <= FREE_ATTEMPTS; i++) {
      rec = nextLockout(rec, 1_000)
      expect(rec.fails).toBe(i)
      expect(rec.lockedUntil).toBe(0)
    }
    expect(attemptsRemaining(rec)).toBe(0)
  })

  it('locks out with an escalating, capped delay past the allowance', () => {
    let rec = NO_LOCKOUT
    for (let i = 0; i < FREE_ATTEMPTS; i++) rec = nextLockout(rec, 0)

    const first = nextLockout(rec, 10_000)
    expect(first.lockedUntil).toBe(10_000 + 30_000) // 30s

    const second = nextLockout(first, 10_000)
    expect(second.lockedUntil).toBe(10_000 + 60_000) // 1m — escalates

    // Drive well past the schedule; the delay caps at 1h, never grows unbounded.
    let r = second
    for (let i = 0; i < 20; i++) r = nextLockout(r, 10_000)
    expect(r.lockedUntil).toBe(10_000 + 60 * 60_000) // capped at 1h
  })

  it('remainingLockoutMs counts down and floors at zero', () => {
    const rec = { fails: FREE_ATTEMPTS + 1, lockedUntil: 5_000 }
    expect(remainingLockoutMs(rec, 4_000)).toBe(1_000)
    expect(remainingLockoutMs(rec, 5_000)).toBe(0)
    expect(remainingLockoutMs(rec, 9_000)).toBe(0) // never negative
  })

  it('attemptsRemaining reflects the free allowance', () => {
    expect(attemptsRemaining(NO_LOCKOUT)).toBe(FREE_ATTEMPTS)
    expect(attemptsRemaining({ fails: 2, lockedUntil: 0 })).toBe(FREE_ATTEMPTS - 2)
    expect(attemptsRemaining({ fails: 99, lockedUntil: 0 })).toBe(0) // never negative
  })

  it('parseLockoutRecord tolerates absent/corrupt data', () => {
    expect(parseLockoutRecord(null)).toEqual(NO_LOCKOUT)
    expect(parseLockoutRecord('not json')).toEqual(NO_LOCKOUT)
    expect(parseLockoutRecord('{"fails":"x"}')).toEqual(NO_LOCKOUT)
    expect(parseLockoutRecord('{"fails":3,"lockedUntil":42}')).toEqual({
      fails: 3,
      lockedUntil: 42,
    })
  })
})
