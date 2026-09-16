/** Build the public ICS subscription URL for iPhone Calendar (and Google Add by URL). */

export type CalendarFeedQuery = {
  team: string
  groups?: string[]
  includeMeets?: boolean
  includeEvents?: boolean
}

export function canSubscribeCalendar(query: CalendarFeedQuery): boolean {
  const groups = (query.groups ?? []).map((g) => g.trim()).filter(Boolean)
  return groups.length > 0 || Boolean(query.includeMeets) || Boolean(query.includeEvents)
}

export function calendarFeedSearch(query: CalendarFeedQuery): string {
  const params = new URLSearchParams()
  params.set('team', query.team)
  const groups = (query.groups ?? []).map((g) => g.trim()).filter(Boolean)
  if (groups.length) params.set('group', groups.join(','))

  const practices = groups.length > 0
  const meets = Boolean(query.includeMeets)
  const events = Boolean(query.includeEvents)
  if (practices && meets && events) {
    params.set('include', 'all')
  } else if (!practices && (meets || events)) {
    const bits: string[] = []
    if (meets) bits.push('meets')
    if (events) bits.push('events')
    params.set('include', bits.join(','))
  } else if (practices && (meets || events)) {
    const bits = ['practice']
    if (meets) bits.push('meets')
    if (events) bits.push('events')
    params.set('include', bits.join(','))
  }
  return params.toString()
}

export function calendarFeedPath(query: CalendarFeedQuery): string {
  return `/api/calendar?${calendarFeedSearch(query)}`
}

export function calendarFeedHttpsUrl(
  origin: string,
  query: CalendarFeedQuery,
): string {
  return `${origin.replace(/\/$/, '')}${calendarFeedPath(query)}`
}

export function calendarFeedWebcalUrl(
  origin: string,
  query: CalendarFeedQuery,
): string {
  return calendarFeedHttpsUrl(origin, query)
    .replace(/^https:/i, 'webcal:')
    .replace(/^http:/i, 'webcal:')
}

/** iPhone Calendar must fetch a public HTTPS host, not local Vite. */
export function publicFeedOrigin(windowOrigin: string): string {
  try {
    const url = new URL(windowOrigin)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return 'https://myswimday.com'
    }
  } catch {
    // keep given origin
  }
  return windowOrigin.replace(/\/$/, '')
}
