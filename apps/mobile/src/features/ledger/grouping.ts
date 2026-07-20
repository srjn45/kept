/**
 * Day-grouping for the ledger list (§8 Phase 4).
 *
 * Turns a flat, already-ordered (`occurred_on DESC, created_at DESC`) list of entries into
 * per-calendar-day sections with a signed day total, for a SectionList with day headers like
 * "Wed, Jul 3 — −₹840". Pure TypeScript (no RN imports) so it is unit-testable in isolation.
 *
 * Currency note (§6.3 / §6.6): money is never silently summed across currencies. The day
 * total is computed PER currency; a day with a single currency (the common case) shows one
 * net amount, and a rare mixed-currency day shows one net per currency.
 */
import type { EntryWithTags } from '@/data'

/** A signed net total in a single currency. */
export type CurrencyTotal = { currency: string; net: number }

export type DaySection = {
  /** The `YYYY-MM-DD` calendar date this section groups. */
  date: string
  /** Human day label, e.g. "Wed, Jul 3" (or "Today" / "Yesterday"). */
  title: string
  /** Signed net total(s), one per currency present that day. */
  totals: CurrencyTotal[]
  /** The entries for this day, preserving the input order. */
  data: EntryWithTags[]
}

/**
 * Format a `YYYY-MM-DD` calendar date as a short human day label. Built from the date's
 * PARTS (local `new Date(y, m-1, d)`) so there is no timezone parsing shift (§6.6). Returns
 * "Today"/"Yesterday" relative to `todayIso` when it is provided and matches. The year is
 * appended only when the date falls outside the current year (e.g. "Wed, Jul 1, 2025"), so
 * imported prior-year rows aren't mistaken for the current year; same-year dates stay compact.
 */
export function formatDayTitle(isoDate: string, todayIso?: string): string {
  if (todayIso && isoDate === todayIso) return 'Today'
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  if (todayIso) {
    const [ty, tm, td] = todayIso.split('-').map(Number)
    const yesterday = new Date(ty, tm - 1, td - 1)
    if (
      yesterday.getFullYear() === date.getFullYear() &&
      yesterday.getMonth() === date.getMonth() &&
      yesterday.getDate() === date.getDate()
    ) {
      return 'Yesterday'
    }
  }
  // Reference year is `todayIso`'s year when provided, else the clock's current year.
  const currentYear = todayIso ? Number(todayIso.slice(0, 4)) : new Date().getFullYear()
  try {
    return new Intl.DateTimeFormat('en', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(date.getFullYear() !== currentYear ? { year: 'numeric' } : {}),
    }).format(date)
  } catch {
    return isoDate
  }
}

/** Sum a day's entries into a signed net total per currency, ordered by currency code. */
export function totalsByCurrency(entries: readonly EntryWithTags[]): CurrencyTotal[] {
  const byCurrency = new Map<string, number>()
  for (const e of entries) {
    byCurrency.set(e.currency, (byCurrency.get(e.currency) ?? 0) + e.amountMinor)
  }
  return [...byCurrency.entries()]
    .map(([currency, net]) => ({ currency, net }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
}

/**
 * Group ordered entries into day sections. Assumes `entries` is already sorted newest-first;
 * consecutive entries sharing an `occurred_on` form one section, so section order follows the
 * input order. `todayIso` (optional) enables the "Today"/"Yesterday" relative titles.
 */
export function groupEntriesByDay(
  entries: readonly EntryWithTags[],
  todayIso?: string
): DaySection[] {
  const sections: DaySection[] = []
  let current: DaySection | null = null
  for (const entry of entries) {
    if (!current || current.date !== entry.occurredOn) {
      current = {
        date: entry.occurredOn,
        title: formatDayTitle(entry.occurredOn, todayIso),
        totals: [],
        data: [],
      }
      sections.push(current)
    }
    current.data.push(entry)
  }
  for (const section of sections) {
    section.totals = totalsByCurrency(section.data)
  }
  return sections
}
