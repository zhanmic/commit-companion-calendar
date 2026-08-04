/** Defaults match api/_lib/tenants.js digest send hours. */
export const DEFAULT_DAILY_SEND_HOUR = 7
export const DEFAULT_WEEKLY_SEND_HOUR = 18

/** Format a 0–23 hour as "7 a.m." / "6 p.m." / "12 p.m." */
export function formatClockHour(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24
  const h12 = h % 12 || 12
  const suffix = h < 12 ? 'a.m.' : 'p.m.'
  return `${h12} ${suffix}`
}

/** Short zone label when reliable (e.g. ET); otherwise empty. */
export function shortTimeZoneLabel(timeZone: string, at = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(at)
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
    // Prefer compact forms like ET / PT; skip GMT-4 style.
    if (/^[A-Z]{2,5}$/.test(name)) return name
    return ''
  } catch {
    return ''
  }
}

export function dailyDigestHint(
  hour = DEFAULT_DAILY_SEND_HOUR,
  timeZone?: string,
): string {
  const clock = formatClockHour(hour)
  const tz = timeZone ? shortTimeZoneLabel(timeZone) : ''
  return tz ? `Every day at ${clock} ${tz}` : `Every day at ${clock}`
}

export function weeklyDigestHint(
  hour = DEFAULT_WEEKLY_SEND_HOUR,
  timeZone?: string,
): string {
  const clock = formatClockHour(hour)
  const tz = timeZone ? shortTimeZoneLabel(timeZone) : ''
  return tz ? `Sunday at ${clock} ${tz}` : `Sunday at ${clock}`
}
