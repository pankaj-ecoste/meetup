import 'server-only'

// IST is a fixed UTC+5:30 (no DST) — same convention as lib/server/claude.ts.
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

/** Start-of-day (UTC instant) for a given IST calendar date, e.g. "2026-07-27". */
export function istDateToUtcStart(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS)
}

/** [start, end) UTC instants spanning "today" in IST. */
export function istTodayBoundsUtc(): { start: string; end: string } {
  const istNow = new Date(Date.now() + IST_OFFSET_MS)
  const y = istNow.getUTCFullYear()
  const m = istNow.getUTCMonth()
  const d = istNow.getUTCDate()
  const startUtc = new Date(Date.UTC(y, m, d) - IST_OFFSET_MS)
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000)
  return { start: startUtc.toISOString(), end: endUtc.toISOString() }
}
