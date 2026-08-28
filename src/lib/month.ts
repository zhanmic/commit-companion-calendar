import { format, getWeek } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import {
  TEAM_TZ,
  atLocalMidnight,
  getWeekModel,
  isCurrentWeek,
  localParts,
  parseWeekSearch,
  pathWithWeek,
  weekIsoFromAnchor,
  type CalendarDay,
} from './week'

export type ScheduleView = 'week' | 'month'

export const VIEW_QUERY_PARAM = 'view'
export const MONTH_QUERY_PARAM = 'month'

export interface MonthWeek {
  weekNumber: number
  days: CalendarDay[]
}

export interface MonthModel {
  year: number
  /** 0–11, local to `timeZone` */
  month: number
  label: string
  rangeStart: Date
  rangeEnd: Date
  weeks: MonthWeek[]
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function lastDateOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function dayOnOrAfter(
  day: CalendarDay,
  year: number,
  month: number,
  date: number,
): boolean {
  if (day.year !== year) return day.year > year
  if (day.month !== month) return day.month > month
  return day.date >= date
}

export function getMonthModel(
  anchor: Date,
  timeZone: string = TEAM_TZ,
): MonthModel {
  const parts = localParts(anchor, timeZone)
  const year = parts.year
  const month = parts.month
  const first = atLocalMidnight(year, month, 1, timeZone)
  const lastDate = lastDateOfMonth(year, month)

  const weeks: MonthWeek[] = []
  let cursor = first
  for (let i = 0; i < 6; i++) {
    const week = getWeekModel(cursor, timeZone)
    const sunday = toZonedTime(week.rangeStart, timeZone)
    weeks.push({
      weekNumber: getWeek(sunday, { weekStartsOn: 0 }),
      days: week.days,
    })
    const saturday = week.days[6]
    if (dayOnOrAfter(saturday, year, month, lastDate)) break
    cursor = atLocalMidnight(
      saturday.year,
      saturday.month,
      saturday.date + 1,
      timeZone,
    )
  }

  const rangeStart = getWeekModel(first, timeZone).rangeStart
  const lastWeek = weeks[weeks.length - 1]
  const lastDay = lastWeek.days[6]
  const rangeEnd = atLocalMidnight(
    lastDay.year,
    lastDay.month,
    lastDay.date + 1,
    timeZone,
  )

  return {
    year,
    month,
    label: format(toZonedTime(first, timeZone), 'MMMM yyyy'),
    rangeStart,
    rangeEnd,
    weeks,
  }
}

export function shiftMonth(
  anchor: Date,
  deltaMonths: number,
  timeZone: string = TEAM_TZ,
): Date {
  const parts = localParts(anchor, timeZone)
  return atLocalMidnight(parts.year, parts.month + deltaMonths, 1, timeZone)
}

export function monthIsoFromAnchor(
  anchor: Date,
  timeZone: string = TEAM_TZ,
): string {
  const parts = localParts(anchor, timeZone)
  return `${parts.year}-${pad2(parts.month + 1)}`
}

export function dateFromMonthIso(
  iso: string,
  timeZone: string = TEAM_TZ,
): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(iso.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  if (month < 0 || month > 11) return null
  return atLocalMidnight(year, month, 1, timeZone)
}

export function isCurrentMonth(
  anchor: Date,
  timeZone: string = TEAM_TZ,
  now: Date = new Date(),
): boolean {
  return monthIsoFromAnchor(anchor, timeZone) === monthIsoFromAnchor(now, timeZone)
}

export function parseMonthSearch(
  search: string,
  timeZone: string = TEAM_TZ,
): Date | null {
  const raw = search.startsWith('?') ? search.slice(1) : search
  const iso = new URLSearchParams(raw).get(MONTH_QUERY_PARAM)
  if (!iso) return null
  return dateFromMonthIso(iso, timeZone)
}

export function isMonthViewSearch(search: string): boolean {
  const raw = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(raw).get(VIEW_QUERY_PARAM) === 'month'
}

export function parseScheduleSearch(
  search: string,
  timeZone: string = TEAM_TZ,
): { view: ScheduleView; anchor: Date } {
  if (isMonthViewSearch(search)) {
    return {
      view: 'month',
      anchor: parseMonthSearch(search, timeZone) ?? new Date(),
    }
  }
  return {
    view: 'week',
    anchor: parseWeekSearch(search, timeZone) ?? new Date(),
  }
}

/** Path for week or month view. Omits current-period query keys. */
export function pathWithScheduleSearch(
  pathname: string,
  view: ScheduleView,
  anchor: Date,
  timeZone: string = TEAM_TZ,
): string {
  const path = pathname || '/'
  if (view === 'week') {
    return pathWithWeek(
      path,
      isCurrentWeek(anchor, timeZone) ? null : weekIsoFromAnchor(anchor, timeZone),
    )
  }
  const params = new URLSearchParams()
  params.set(VIEW_QUERY_PARAM, 'month')
  if (!isCurrentMonth(anchor, timeZone)) {
    params.set(MONTH_QUERY_PARAM, monthIsoFromAnchor(anchor, timeZone))
  }
  return `${path}?${params.toString()}`
}
