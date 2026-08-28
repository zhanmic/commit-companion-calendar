import { addDays, format, isSameDay } from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'

export const TEAM_TZ = 'America/New_York'

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
  timeZone: string = TEAM_TZ,
): Date {
  return atLocalMidnight(day.year, day.month, day.date, timeZone)
}

export function getWeekModel(anchor: Date, timeZone: string = TEAM_TZ): WeekModel {
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

export function formatTimeRange(start: Date, end: Date, timeZone: string = TEAM_TZ) {
  const s = toZonedTime(start, timeZone)
  const e = toZonedTime(end, timeZone)
  return `${format(s, 'h:mm a')} – ${format(e, 'h:mm a')}`
}

/** Compact range for dense mobile rows, e.g. 6:30–8:15 AM */
export function formatTimeRangeCompact(
  start: Date,
  end: Date,
  timeZone: string = TEAM_TZ,
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
  timeZone: string = TEAM_TZ,
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
  timeZone: string = TEAM_TZ,
) {
  const local = toZonedTime(occStart, timeZone)
  return (
    local.getFullYear() === day.year &&
    local.getMonth() === day.month &&
    local.getDate() === day.date
  )
}

export function shiftWeek(anchor: Date, deltaWeeks: number) {
  return addDays(anchor, deltaWeeks * 7)
}

/** Query key for shareable week links, e.g. `/DelmarDolfins?week=2026-07-19`. */
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
  timeZone: string = TEAM_TZ,
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
  timeZone: string = TEAM_TZ,
): string {
  const day = getWeekModel(anchor, timeZone).days[0]
  return isoDateFromParts(day.year, day.month, day.date)
}

export function isCurrentWeek(
  anchor: Date,
  timeZone: string = TEAM_TZ,
  now: Date = new Date(),
): boolean {
  return weekIsoFromAnchor(anchor, timeZone) === weekIsoFromAnchor(now, timeZone)
}

/** Read `?week=YYYY-MM-DD` from a query string. Any day in the week is accepted. */
export function parseWeekSearch(
  search: string,
  timeZone: string = TEAM_TZ,
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
