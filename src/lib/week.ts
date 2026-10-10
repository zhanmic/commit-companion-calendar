import { addDays, format, isSameDay } from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'

export interface CalendarDay {
  year: number
  month: number
  date: number
  key: string
}

export interface WeekModel {
  /** Real UTC instants for filtering/expansion */
  rangeStart: Date
  rangeEnd: Date
  /** Local calendar days (Y/M/D in team TZ) for column headers */
  days: CalendarDay[]
  label: string
}

export function localParts(date: Date, timeZone: string) {
  const z = toZonedTime(date, timeZone)
  return {
    year: z.getFullYear(),
    month: z.getMonth(),
    date: z.getDate(),
    day: z.getDay(),
  }
}

export function atLocalMidnight(
  year: number,
  month: number,
  date: number,
  timeZone: string,
): Date {
  return fromZonedTime(new Date(year, month, date, 0, 0, 0, 0), timeZone)
}

export function instantFromDay(
  day: CalendarDay,
  timeZone: string,
): Date {
  return atLocalMidnight(day.year, day.month, day.date, timeZone)
}

export function getWeekModel(anchor: Date, timeZone: string): WeekModel {
  const parts = localParts(anchor, timeZone)
  const weekStartDate = parts.date - parts.day // Sunday-based
  const start = atLocalMidnight(parts.year, parts.month, weekStartDate, timeZone)

  const startParts = localParts(start, timeZone)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = atLocalMidnight(
      startParts.year,
      startParts.month,
      startParts.date + i,
      timeZone,
    )
    const p = localParts(d, timeZone)
    return {
      year: p.year,
      month: p.month,
      date: p.date,
      key: `${p.year}-${p.month + 1}-${p.date}`,
    }
  })

  const endParts = days[6]
  const rangeEnd = atLocalMidnight(
    endParts.year,
    endParts.month,
    endParts.date + 1,
    timeZone,
  )

  const startLabel = format(
    toZonedTime(start, timeZone),
    'MMM d',
  )
  const endLabelDate = toZonedTime(
    atLocalMidnight(endParts.year, endParts.month, endParts.date, timeZone),
    timeZone,
  )
  const endLabel =
    startParts.month === endParts.month
      ? format(endLabelDate, 'd, yyyy')
      : format(endLabelDate, 'MMM d, yyyy')

  return {
    rangeStart: start,
    rangeEnd,
    days,
    label: `${startLabel} – ${endLabel}`,
  }
}

export function formatTimeRange(start: Date, end: Date, timeZone: string) {
  const s = toZonedTime(start, timeZone)
  const e = toZonedTime(end, timeZone)
  return `${format(s, 'h:mm a')} – ${format(e, 'h:mm a')}`
}

/** Compact range for dense mobile rows, e.g. 6:30–8:15 AM */
export function formatTimeRangeCompact(
  start: Date,
  end: Date,
  timeZone: string,
) {
  const s = toZonedTime(start, timeZone)
  const e = toZonedTime(end, timeZone)
  const sPeriod = format(s, 'a')
  const ePeriod = format(e, 'a')
  if (sPeriod === ePeriod) {
    return `${format(s, 'h:mm')}–${format(e, 'h:mm a')}`
  }
  return `${format(s, 'h:mm a')}–${format(e, 'h:mm a')}`
}

export function dayHeading(
  day: WeekModel['days'][number],
  timeZone: string,
) {
  const instant = atLocalMidnight(day.year, day.month, day.date, timeZone)
  const local = toZonedTime(instant, timeZone)
  const today = toZonedTime(new Date(), timeZone)
  return {
    weekday: format(local, 'EEE'),
    date: format(local, 'MMM d'),
    shortDate: format(local, 'M/d'),
    isToday: isSameDay(local, today),
    instant,
  }
}

export function isOccurrenceOnDay(
  occStart: Date,
  day: WeekModel['days'][number],
  timeZone: string,
) {
  const local = toZonedTime(occStart, timeZone)
  return (
    local.getFullYear() === day.year &&
    local.getMonth() === day.month &&
    local.getDate() === day.date
  )
}

/**
 * True when [start, end) overlaps this local calendar day.
 * A zero-length interval (start === end) occupies only its start day.
 * An end that lands on local midnight does not occupy that next day.
 */
export function intervalOverlapsDay(
  start: Date,
  end: Date,
  day: WeekModel['days'][number],
  timeZone: string,
): boolean {
  const dayStart = atLocalMidnight(day.year, day.month, day.date, timeZone)
  const dayEnd = atLocalMidnight(day.year, day.month, day.date + 1, timeZone)
  if (end.getTime() <= start.getTime()) {
    return start >= dayStart && start < dayEnd
  }
  return start < dayEnd && end > dayStart
}

/**
 * Practices stay on the day they start. Meets and team events occupy every
 * local day their interval overlaps, matching Commit's multi-day bars.
 */
export function occurrenceFallsOnDay(
  occ: { label: string; start: Date; end: Date },
  day: WeekModel['days'][number],
  timeZone: string,
): boolean {
  if (occ.label === 'practice') {
    return isOccurrenceOnDay(occ.start, day, timeZone)
  }
  return intervalOverlapsDay(occ.start, occ.end, day, timeZone)
}

/** Last local calendar day occupied by [start, end). */
function occupiedLocalEnd(start: Date, end: Date, timeZone: string): Date {
  if (end.getTime() <= start.getTime()) return toZonedTime(start, timeZone)
  const zonedEnd = toZonedTime(end, timeZone)
  const atMidnight =
    zonedEnd.getHours() === 0 &&
    zonedEnd.getMinutes() === 0 &&
    zonedEnd.getSeconds() === 0 &&
    zonedEnd.getMilliseconds() === 0
  return atMidnight ? addDays(zonedEnd, -1) : zonedEnd
}

export function isMultiDayInterval(
  start: Date,
  end: Date,
  timeZone: string,
): boolean {
  const s = toZonedTime(start, timeZone)
  const e = occupiedLocalEnd(start, end, timeZone)
  return (
    s.getFullYear() !== e.getFullYear() ||
    s.getMonth() !== e.getMonth() ||
    s.getDate() !== e.getDate()
  )
}

/** "Oct 23–25" when the interval covers more than one local day, else null. */
export function formatDateSpan(
  start: Date,
  end: Date,
  timeZone: string,
): string | null {
  if (!isMultiDayInterval(start, end, timeZone)) return null
  const s = toZonedTime(start, timeZone)
  const e = occupiedLocalEnd(start, end, timeZone)
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${format(s, 'MMM d')}–${format(e, 'd')}`
  }
  if (s.getFullYear() === e.getFullYear()) {
    return `${format(s, 'MMM d')}–${format(e, 'MMM d')}`
  }
  return `${format(s, 'MMM d, yyyy')}–${format(e, 'MMM d, yyyy')}`
}

/** Detail view: include clocks when the meet runs across days. */
export function formatOccurrenceWhen(
  start: Date,
  end: Date,
  timeZone: string,
): string {
  if (!isMultiDayInterval(start, end, timeZone)) {
    return formatTimeRange(start, end, timeZone)
  }
  const s = toZonedTime(start, timeZone)
  const e = toZonedTime(end, timeZone)
  return `${format(s, 'MMM d, h:mm a')} – ${format(e, 'MMM d, h:mm a')}`
}

/** Week/month chips: date span for multi-day items, otherwise the clock range. */
export function formatOccurrenceWhenCompact(
  start: Date,
  end: Date,
  timeZone: string,
): string {
  return formatDateSpan(start, end, timeZone) ?? formatTimeRangeCompact(start, end, timeZone)
}

export function shiftWeek(anchor: Date, deltaWeeks: number) {
  return addDays(anchor, deltaWeeks * 7)
}

/** Query key for shareable week links, e.g. `/1?week=2026-07-19`. */
export const WEEK_QUERY_PARAM = 'week'

/**
 * Demo week shown from the landing “See a live schedule” CTA
 * (Sunday 19 Jul 2026 — a full practice week).
 */
export const DEMO_WEEK_ISO = '2026-07-19'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function isoDateFromParts(
  year: number,
  month: number,
  date: number,
): string {
  return `${year}-${pad2(month + 1)}-${pad2(date)}`
}

/** Parse `YYYY-MM-DD` into a local-midnight instant in `timeZone`. */
export function dateFromIso(
  iso: string,
  timeZone: string,
): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  const date = Number(m[3])
  if (month < 0 || month > 11 || date < 1 || date > 31) return null
  return atLocalMidnight(year, month, date, timeZone)
}

/** Sunday of the week containing `anchor`, as `YYYY-MM-DD`. */
export function weekIsoFromAnchor(
  anchor: Date,
  timeZone: string,
): string {
  const day = getWeekModel(anchor, timeZone).days[0]
  return isoDateFromParts(day.year, day.month, day.date)
}

export function isCurrentWeek(
  anchor: Date,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  return weekIsoFromAnchor(anchor, timeZone) === weekIsoFromAnchor(now, timeZone)
}

/** Read `?week=YYYY-MM-DD` from a query string. Any day in the week is accepted. */
export function parseWeekSearch(
  search: string,
  timeZone: string,
): Date | null {
  const raw = search.startsWith('?') ? search.slice(1) : search
  const iso = new URLSearchParams(raw).get(WEEK_QUERY_PARAM)
  if (!iso) return null
  return dateFromIso(iso, timeZone)
}

/** Path + optional week query. Omits `?week=` when `weekIso` is null. */
export function pathWithWeek(pathname: string, weekIso: string | null): string {
  const path = pathname || '/'
  if (!weekIso) return path
  return `${path}?${WEEK_QUERY_PARAM}=${weekIso}`
}

/** Landing / outreach demo calendar path for a tenant. */
export function demoSchedulePath(tenantPath: string): string {
  return pathWithWeek(tenantPath, DEMO_WEEK_ISO)
}
