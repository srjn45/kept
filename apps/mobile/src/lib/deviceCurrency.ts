/**
 * Device-locale currency detection (used only to pick the seeded default currency on a
 * fresh install / forgot-PIN wipe — see `seedDatabase`). The app is fully multi-currency;
 * this just chooses a sensible starting default instead of hardcoding one region's currency.
 *
 * Lives in `lib` (not `domain`) because it touches a native module (`expo-localization`),
 * so it is kept out of the pure, unit-tested `domain`/`db` layers.
 */
import { getLocales } from 'expo-localization'

import { currencySchema } from '@/domain'

/**
 * Neutral fallback when the device exposes no usable currency (e.g. web, or a locale with a
 * null `currencyCode`). USD is the most widely-recognised default; the user can change it in
 * Settings at any time.
 */
export const FALLBACK_CURRENCY = 'USD'

/**
 * Best-effort ISO 4217 currency code for the device's region. Walks the ordered locale list
 * and returns the first valid `currencyCode`; falls back to {@link FALLBACK_CURRENCY} if none
 * is available or the native call throws. The result is normalised (uppercase, 3 letters).
 */
export function getDeviceDefaultCurrency(fallback: string = FALLBACK_CURRENCY): string {
  try {
    for (const locale of getLocales()) {
      const parsed = currencySchema.safeParse(locale.currencyCode)
      if (parsed.success) return parsed.data
    }
  } catch {
    // Native module unavailable or threw — fall through to the fallback.
  }
  const safeFallback = currencySchema.safeParse(fallback)
  return safeFallback.success ? safeFallback.data : FALLBACK_CURRENCY
}
