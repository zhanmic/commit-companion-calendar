/**
 * RFC 5545 ICS for iPhone Calendar subscriptions (and one-off downloads).
 * Mirrors src/lib/calendar.ts so Add to Calendar and the live feed match.
 */
import { toZonedTime } from 'date-fns-tz'

const PRODUCT_ICS_PRODID = '-//My Swim Day//EN'
const PRODUCT_ICS_DOMAIN = 'myswimday.com'
const PRODUCT_NAME = 'My Swim Day'

function pad(value, size = 2) {
  return String(value).padStart(size, '0')
}

export function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

export function formatIcsLocal(date, timeZone) {
  const zoned = toZonedTime(date, timeZone)
  return (
    `${zoned.getFullYear()}${pad(zoned.getMonth() + 1)}${pad(zoned.getDate())}` +
    `T${pad(zoned.getHours())}${pad(zoned.getMinutes())}${pad(zoned.getSeconds())}`
  )
}

export function formatIcsUtcStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function sessionKindLabel(occ) {
  if (occ.label === 'meet') return 'Meet'
  if (occ.label === 'event') return 'Event'
  return 'Practice'
}

export function occurrenceSummary(occ) {
  const kind = sessionKindLabel(occ)
  const teams = Array.isArray(occ.subTeams) ? occ.subTeams : []
  if (occ.label !== 'meet' && occ.label !== 'event' && teams.length > 0) {
    return `${teams.join('/')} ${kind}`
  }
  const name = typeof occ.name === 'string' ? occ.name.trim() : ''
  return name || kind
}

function occurrenceDescription(occ, sourceLabel) {
  const teams = Array.isArray(occ.subTeams) ? occ.subTeams : []
  const lines = [
    `Type: ${sessionKindLabel(occ)}`,
    occ.name ? `Name: ${occ.name}` : null,
    teams.length ? `Groups: ${teams.join(', ')}` : null,
    occ.location ? `Location: ${occ.location}` : null,
    `Source: ${sourceLabel}`,
  ].filter(Boolean)
  return lines.join('\n')
}

export function occurrenceUid(occ) {
  return `${occ.id}@${PRODUCT_ICS_DOMAIN}`
}

export function icsFilename(tenant) {
  const raw = tenant?.icsFilenamePrefix || tenant?.slug || 'schedule'
  const slug = String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'schedule'}.ics`
}

export function feedCalendarName(tenant, groups, kinds) {
  const team = tenant?.displayName || PRODUCT_NAME
  const labels = (groups ?? []).map((g) => g.label || g.id).filter(Boolean)
  const extras = []
  if (kinds?.meets) extras.push('meets')
  if (kinds?.events) extras.push('events')
  if (labels.length && extras.length) {
    return `${team} · ${labels.join(', ')} + ${extras.join(' & ')}`
  }
  if (labels.length) return `${team} · ${labels.join(', ')}`
  if (extras.length) return `${team} · ${extras.join(' & ')}`
  return team
}

export function buildIcsEvent(occ, timeZone, now = new Date(), sourceLabel = PRODUCT_NAME) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${occurrenceUid(occ)}`,
    `DTSTAMP:${formatIcsUtcStamp(now)}`,
    `DTSTART;TZID=${timeZone}:${formatIcsLocal(occ.start, timeZone)}`,
    `DTEND;TZID=${timeZone}:${formatIcsLocal(occ.end, timeZone)}`,
    `SUMMARY:${escapeIcsText(occurrenceSummary(occ))}`,
  ]
  if (occ.location) {
    lines.push(`LOCATION:${escapeIcsText(occ.location)}`)
  }
  lines.push(
    `DESCRIPTION:${escapeIcsText(occurrenceDescription(occ, sourceLabel))}`,
  )
  lines.push('END:VEVENT')
  return lines.join('\r\n')
}

export function buildIcsCalendar(
  occurrences,
  {
    calendarName = PRODUCT_NAME,
    timeZone,
    sourceLabel = PRODUCT_NAME,
    calendarUrl = '',
    subscribe = false,
  } = {},
) {
  const now = new Date()
  const events = (occurrences ?? [])
    .slice()
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((occ) => buildIcsEvent(occ, timeZone, now, sourceLabel))
    .join('\r\n')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODUCT_ICS_PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    `X-WR-TIMEZONE:${escapeIcsText(timeZone)}`,
  ]
  if (subscribe) {
    lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT6H')
    lines.push('X-PUBLISHED-TTL:PT6H')
  }
  if (calendarUrl) {
    lines.push(`URL:${calendarUrl}`)
    lines.push(`X-WR-CALDESC:${escapeIcsText(`Live ${PRODUCT_NAME} schedule. ${calendarUrl}`)}`)
  }
  if (events) lines.push(events)
  lines.push('END:VCALENDAR')
  return `${lines.join('\r\n')}\r\n`
}
