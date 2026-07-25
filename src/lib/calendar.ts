import { toZonedTime } from 'date-fns-tz'
import {
  PRODUCT_ICS_DOMAIN,
  PRODUCT_ICS_PRODID,
  PRODUCT_NAME,
} from '../product'
import type { Occurrence } from '../types'
import { TEAM_TZ } from './week'

function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0')
}

/** Escape text for ICS property values (same rules as swim-carpool). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/** Local wall-clock datetime for TZID fields: 20260721T063000 */
function formatIcsLocal(date: Date, timeZone: string): string {
  const zoned = toZonedTime(date, timeZone)
  return (
    `${zoned.getFullYear()}${pad(zoned.getMonth() + 1)}${pad(zoned.getDate())}` +
    `T${pad(zoned.getHours())}${pad(zoned.getMinutes())}${pad(zoned.getSeconds())}`
  )
}

function formatIcsUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function sessionKindLabel(occ: Occurrence): string {
  if (occ.label === 'meet') return 'Meet'
  if (occ.label === 'event') return 'Event'
  return 'Practice'
}

function occurrenceSummary(occ: Occurrence): string {
  const kind = sessionKindLabel(occ)
  if (occ.label === 'practice' && occ.subTeams.length > 0) {
    return `${occ.subTeams.join('/')} ${kind}`
  }
  return occ.name.trim() || kind
}

function occurrenceDescription(occ: Occurrence, sourceLabel: string): string {
  const lines = [
    `Type: ${sessionKindLabel(occ)}`,
    occ.name ? `Name: ${occ.name}` : null,
    occ.subTeams.length ? `Groups: ${occ.subTeams.join(', ')}` : null,
    occ.location ? `Location: ${occ.location}` : null,
    `Source: ${sourceLabel}`,
  ].filter(Boolean) as string[]
  return lines.join('\n')
}

function occurrenceUid(occ: Occurrence): string {
  return `${occ.id}@${PRODUCT_ICS_DOMAIN}`
}

export function buildIcsEvent(
  occ: Occurrence,
  timeZone: string = TEAM_TZ,
  now = new Date(),
  sourceLabel: string = PRODUCT_NAME,
): string {
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
  occurrences: Occurrence[],
  calendarName = PRODUCT_NAME,
  timeZone: string = TEAM_TZ,
  sourceLabel: string = PRODUCT_NAME,
): string {
  const now = new Date()
  const events = occurrences
    .slice()
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((occ) => buildIcsEvent(occ, timeZone, now, sourceLabel))
    .join('\r\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODUCT_ICS_PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    events,
    'END:VCALENDAR',
  ].join('\r\n')
}

function slugifyFilename(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'session'
  )
}

export function calendarFilenameForOccurrences(
  occurrences: Occurrence[],
  filenamePrefix = 'schedule',
): string {
  if (occurrences.length === 1) {
    return `${filenamePrefix}-${slugifyFilename(occurrenceSummary(occurrences[0]))}.ics`
  }
  return `${filenamePrefix}-week-${occurrences.length}-sessions.ics`
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/i.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/**
 * Blob download (same pattern as swim-carpool). Used as desktop fallback and
 * when the ICS is too large for the inline API URL.
 */
export function downloadCalendarEvent(icsContent: string, filename: string): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Open a server-served inline .ics URL so iPhone Safari shows Quick Look
 * with the native “Add To Calendar” button.
 */
function openInlineCalendarApi(ics: string): boolean {
  const encoded = toBase64Url(ics)
  // Keep well under typical mobile URL limits.
  if (encoded.length > 6000) return false
  const url = `/api/calendar?d=${encoded}`
  window.location.assign(url)
  return true
}

export interface OfferCalendarOptions {
  calendarName?: string
  timeZone?: string
  sourceLabel?: string
  filenamePrefix?: string
}

/**
 * Offer an .ics calendar to the user.
 * On iPhone, prefer an inline HTTPS .ics response (Quick Look + Add To Calendar).
 * Otherwise use the carpool-style blob download.
 */
export async function offerCalendarFile(
  occurrences: Occurrence[],
  options: OfferCalendarOptions = {},
): Promise<'opened' | 'downloaded' | 'empty'> {
  if (occurrences.length === 0) return 'empty'

  const calendarName = options.calendarName ?? PRODUCT_NAME
  const timeZone = options.timeZone ?? TEAM_TZ
  const sourceLabel = options.sourceLabel ?? PRODUCT_NAME
  const filenamePrefix = options.filenamePrefix ?? 'schedule'

  const ics = buildIcsCalendar(occurrences, calendarName, timeZone, sourceLabel)
  const filename = calendarFilenameForOccurrences(occurrences, filenamePrefix)

  if (isAppleTouchDevice() && openInlineCalendarApi(ics)) {
    return 'opened'
  }

  downloadCalendarEvent(ics, filename)
  return 'downloaded'
}
