import {
  applySign,
  deriveEntryType,
  formatMinor,
  minorUnitExponent,
  parseAmountInput,
  toMajorUnits,
  toMinorUnits,
} from '@/domain'

describe('minorUnitExponent — currency-aware precision (§6.1)', () => {
  it('defaults to 2 decimals for INR/USD/EUR', () => {
    expect(minorUnitExponent('INR')).toBe(2)
    expect(minorUnitExponent('USD')).toBe(2)
    expect(minorUnitExponent('EUR')).toBe(2)
  })
  it('is 0 for JPY and 3 for BHD/KWD', () => {
    expect(minorUnitExponent('JPY')).toBe(0)
    expect(minorUnitExponent('BHD')).toBe(3)
    expect(minorUnitExponent('KWD')).toBe(3)
  })
  it('normalises case and falls back to 2 for unknown codes', () => {
    expect(minorUnitExponent('jpy')).toBe(0)
    expect(minorUnitExponent('XYZ')).toBe(2)
  })
})

describe('toMinorUnits — rounding across 0/2/3-decimal currencies', () => {
  it('scales by the correct factor per currency', () => {
    expect(toMinorUnits(12.34, 'USD')).toBe(1234)
    expect(toMinorUnits(1250, 'JPY')).toBe(1250) // 0 decimals → no scaling
    expect(toMinorUnits(1.5, 'KWD')).toBe(1500) // 3 decimals
  })
  it('rounds half away from binary-float error', () => {
    expect(toMinorUnits(19.99, 'USD')).toBe(1999)
    expect(toMinorUnits(1.005, 'KWD')).toBe(1005) // classic float trap → must be 1005
    expect(toMinorUnits(0.1 + 0.2, 'USD')).toBe(30) // 0.30000000000000004 → 30
  })
  it('rounds half UP for the common 2-decimal case despite float error', () => {
    // 1.005 * 100 = 100.49999999999999 in IEEE-754 — must still round to 101, not 100.
    expect(toMinorUnits(1.005, 'USD')).toBe(101)
    expect(toMinorUnits(1.015, 'USD')).toBe(102)
    expect(toMinorUnits(2.675, 'EUR')).toBe(268) // another well-known float trap
    expect(toMinorUnits(-1.005, 'USD')).toBe(-101) // half-away-from-zero on the negative side
    expect(toMinorUnits(1.004, 'USD')).toBe(100) // genuinely below the half → rounds down
  })
  it('preserves sign of the major input and round-trips back', () => {
    expect(toMinorUnits(-5.5, 'USD')).toBe(-550)
    expect(toMajorUnits(1234, 'USD')).toBeCloseTo(12.34, 10)
    expect(toMajorUnits(1250, 'JPY')).toBe(1250)
  })
  it('throws on non-finite input', () => {
    expect(() => toMinorUnits(NaN, 'USD')).toThrow()
    expect(() => toMinorUnits(Infinity, 'USD')).toThrow()
  })
})

describe('deriveEntryType / applySign (§6.1)', () => {
  it('derives debit for negative, credit for positive', () => {
    expect(deriveEntryType(-1)).toBe('debit')
    expect(deriveEntryType(1)).toBe('credit')
  })
  it('applies the sign from a positive magnitude + toggle', () => {
    expect(applySign(1500, 'debit')).toBe(-1500)
    expect(applySign(1500, 'credit')).toBe(1500)
    expect(applySign(-1500, 'credit')).toBe(1500) // magnitude is abs'd first
  })
})

describe('parseAmountInput', () => {
  it('parses grouped/symboled major-unit strings to minor units', () => {
    expect(parseAmountInput('1,234.50', 'USD')).toBe(123450)
    expect(parseAmountInput('₹99', 'INR')).toBe(9900)
    expect(parseAmountInput('1250', 'JPY')).toBe(1250)
  })
  it('rejects empty, non-numeric, or multi-dot input', () => {
    expect(parseAmountInput('', 'USD')).toBeNull()
    expect(parseAmountInput('.', 'USD')).toBeNull()
    expect(parseAmountInput('1.2.3', 'USD')).toBeNull()
  })
})

describe('formatMinor', () => {
  it('formats at currency precision with symbol', () => {
    expect(formatMinor(-125000, 'INR')).toBe('−₹1,250.00')
    expect(formatMinor(90000, 'INR', { showSign: true })).toBe('+₹900.00')
    expect(formatMinor(1250, 'JPY')).toBe('¥1,250')
  })
  it('formats a plain decimal for CSV (no symbol)', () => {
    expect(formatMinor(123450, 'USD', { withCurrencySymbol: false })).toBe('1234.50')
    expect(formatMinor(-1005, 'KWD', { withCurrencySymbol: false })).toBe('−1.005')
  })
})
