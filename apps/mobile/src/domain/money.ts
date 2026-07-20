/**
 * Money helpers — the canonical rounding/formatting/sign math for the app (§6.1).
 *
 * Money is stored as a SIGNED integer number of MINOR units (paise/cents/fils):
 *   negative = debit (money out), positive = credit (money in).
 * The number of minor units per major unit is CURRENCY-AWARE — never assume "×100":
 *   INR/USD/EUR = 2 decimals, JPY = 0, BHD/KWD = 3, etc.
 *
 * Pure TypeScript, no React/RN imports (see §4). `Intl` is a standard JS global and is
 * fine here; it is only used for optional display formatting.
 */

export type EntryType = 'debit' | 'credit'

/**
 * Minor-unit exponents for currencies that are NOT the default of 2.
 * Source: ISO 4217. Extend as needed; unknown/2-decimal currencies use the default.
 */
const MINOR_UNIT_EXPONENTS: Record<string, number> = {
  // 0-decimal
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  XAF: 0,
  XOF: 0,
  // 3-decimal
  BHD: 3,
  KWD: 3,
  OMR: 3,
  IQD: 3,
  JOD: 3,
  LYD: 3,
  TND: 3,
}

const DEFAULT_EXPONENT = 2

/** Normalise a currency code to the ISO 4217 uppercase form. */
export function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase()
}

/**
 * A curated set of commonly-used currencies for the per-transaction picker (§7.3). Any
 * 3-letter ISO 4217 code is still valid input (see `currencySchema`) — this list is just a
 * friendly shortlist; the picker also shows the entry's current currency even if it isn't
 * one of these.
 */
export const COMMON_CURRENCIES = [
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'THB', name: 'Thai Baht' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
] as const satisfies readonly { code: string; name: string }[]

/** Number of minor units per major unit for a currency (e.g. INR→2, JPY→0, KWD→3). */
export function minorUnitExponent(currency: string): number {
  return MINOR_UNIT_EXPONENTS[normalizeCurrency(currency)] ?? DEFAULT_EXPONENT
}

/** 10 ** exponent — the number of minor units in one major unit. */
export function minorUnitFactor(currency: string): number {
  return 10 ** minorUnitExponent(currency)
}

/**
 * Derived entry type — never stored (§6.1). Zero is treated as credit, but zero
 * amounts are rejected at validation time, so it should never reach here.
 */
export function deriveEntryType(amountMinor: number): EntryType {
  return amountMinor < 0 ? 'debit' : 'credit'
}

/**
 * Apply a debit/credit sign to a non-negative magnitude of minor units.
 * The form collects a positive amount + a Debit/Credit toggle; the repo layer uses
 * this to produce the signed `amount_minor` that gets stored.
 */
export function applySign(magnitudeMinor: number, type: EntryType): number {
  const magnitude = Math.abs(Math.trunc(magnitudeMinor))
  return type === 'debit' ? -magnitude : magnitude
}

/**
 * Convert a major-unit amount (e.g. 12.34) to integer minor units for a currency.
 * Rounds half-away-from-zero at the currency's precision. Throws on non-finite input.
 * The result is UNSIGNED-preserving: the sign of `major` is kept.
 */
export function toMinorUnits(major: number, currency: string): number {
  if (!Number.isFinite(major)) {
    throw new Error(`Invalid amount: ${major}`)
  }
  const factor = minorUnitFactor(currency)
  const scaled = major * factor
  // Neutralise binary-float representation error BEFORE the final round. A fixed
  // `Number.EPSILON` nudge is ~1000× too small at money magnitudes and does nothing for the
  // common 2-decimal case (e.g. 1.005 * 100 = 100.49999999999999 would round DOWN to 100).
  // Re-rounding to 15 significant digits collapses that trailing error (→ 100.5) so the
  // half-away-from-zero round below is correct across 0/2/3-decimal currencies.
  const corrected = Number(scaled.toPrecision(15))
  return corrected >= 0 ? Math.round(corrected) : -Math.round(-corrected)
}

/** Convert integer minor units back to a major-unit number (may be fractional). */
export function toMajorUnits(amountMinor: number, currency: string): number {
  return amountMinor / minorUnitFactor(currency)
}

/**
 * Parse a user-entered amount STRING (major units, e.g. "1,234.50") to minor units.
 * Strips grouping separators and currency symbols; keeps a single decimal point.
 * Returns the magnitude (always >= 0) — apply the debit/credit sign separately.
 * Returns null if the string is not a valid positive number.
 */
export function parseAmountInput(input: string, currency: string): number | null {
  const cleaned = input.trim().replace(/[^0-9.]/g, '')
  if (cleaned === '' || cleaned === '.') return null
  // Reject strings with more than one decimal point.
  if ((cleaned.match(/\./g)?.length ?? 0) > 1) return null
  const major = Number(cleaned)
  if (!Number.isFinite(major) || major < 0) return null
  return toMinorUnits(major, currency)
}

export type FormatMinorOptions = {
  /** Prepend an explicit +/− sign (using U+2212 for minus). Default false. */
  showSign?: boolean
  /** Render with the currency symbol/code via Intl. Default true. */
  withCurrencySymbol?: boolean
  /** BCP 47 locale for Intl formatting. Default 'en'. */
  locale?: string
}

/**
 * Format signed minor units to a human string at the currency's precision.
 * With `withCurrencySymbol` (default) it uses `Intl` currency formatting; otherwise it
 * returns a plain decimal string (useful for CSV export). This is a domain-level helper;
 * the on-screen `AmountText` primitive owns RN rendering.
 */
export function formatMinor(
  amountMinor: number,
  currency: string,
  options: FormatMinorOptions = {}
): string {
  const { showSign = false, withCurrencySymbol = true, locale = 'en' } = options
  const digits = minorUnitExponent(currency)
  const magnitudeMajor = Math.abs(amountMinor) / 10 ** digits
  const negative = amountMinor < 0

  let body: string
  if (withCurrencySymbol) {
    try {
      body = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: normalizeCurrency(currency),
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(magnitudeMajor)
    } catch {
      body = `${magnitudeMajor.toFixed(digits)} ${normalizeCurrency(currency)}`
    }
  } else {
    body = magnitudeMajor.toFixed(digits)
  }

  if (showSign) return `${negative ? '−' : '+'}${body}`
  return negative ? `−${body}` : body
}
