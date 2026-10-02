import { expandEventsInRange } from './monthCalendar.js'

/** Sep 1–Oct 31 2026, end exclusive. */
export const USAGE_RANGE_START = new Date(Date.UTC(2026, 8, 1))
export const USAGE_RANGE_END = new Date(Date.UTC(2026, 10, 1))
export const USAGE_WINDOW_LABEL = 'Sep–Oct 2026'

export type CalendarUsageLevel = 'high' | 'medium' | 'small' | 'none'

export interface CalendarUsage {
  level: CalendarUsageLevel
  practiceCount: number
  eventCount: number
  meetCount: number
  groupCount: number
  practiceDays: number
  weeksWithPractice: number
  windowWeeks: number
  /** Distinct days that have a practice, divided by weeks in the window. */
  daysPerWeek: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseDate(value: unknown): Date | null {
  const raw = str(value)
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function looksLikeCancel(name: string): boolean {
  return /\b(cancel|cancelled|canceled|no practice|no practices|team break|summer break)\b/i.test(
    name,
  )
}

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** ISO week key from a UTC calendar date. */
function weekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function windowWeekCount(start: Date, end: Date): number {
  const weeks = new Set<string>()
  const cursor = new Date(start)
  while (cursor < end) {
    weeks.add(weekKey(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return weeks.size
}

/**
 * Collapse a practice title to a group.
 * "Senior Group - Albany Academy" and "Sr - Siena" both become "sr".
 */
export function practiceGroupKey(name: string): string {
  const head = name.split(/\s+[-–—|@]\s+/)[0] || name
  let s = head.toLowerCase()
  s = s.replace(/\b(pre-?season|practice|practices|session|sessions)\b/g, ' ')
  s = s.replace(/\bgroups?\b/g, ' ')
  s = s.replace(/\b(am|pm|morning|afternoon|evening)\b/g, ' ')
  s = s.replace(/\b(seniors?|sr)\b/g, 'sr')
  s = s.replace(/\b(juniors?|jr)\b/g, 'jr')
  s = s.replace(/\b(developmental|development|devo)\b/g, 'devo')
  s = s.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return head.toLowerCase().trim()
  if (s.startsWith('jr prep')) return 'jr prep'
  const first = s.split(' ')[0]
  if (first === 'sr' || first === 'jr' || first === 'devo') return first
  return s
}

function countMeets(meets: unknown[], rangeStart: Date, rangeEnd: Date): number {
  let n = 0
  for (const raw of meets) {
    const m = asRecord(raw)
    if (!m) continue
    const start = parseDate(m.startDateTime) || parseDate(m.startDate)
    if (!start || start < rangeStart || start >= rangeEnd) continue
    n += 1
  }
  return n
}

/**
 * high: more than 2 groups and practices on about 3.5+ days a week (Delmar / Vortex).
 * medium: a practice in most weeks, including steady schedules with 2 groups or fewer.
 * small: at least one practice, but not a steady weekly plan.
 * none: no practices in the window.
 */
export function classifyCalendarUsage(input: {
  practiceCount: number
  groupCount: number
  practiceDays: number
  weeksWithPractice: number
  windowWeeks: number
}): CalendarUsageLevel {
  if (input.practiceCount <= 0) return 'none'
  const weeks = Math.max(1, input.windowWeeks)
  const daysPerWeek = input.practiceDays / weeks
  const weekCoverage = input.weeksWithPractice / weeks
  const almostDaily = daysPerWeek >= 3.5
  const weekly =
    input.practiceCount >= Math.ceil(weeks * 0.75) &&
    (weekCoverage >= 0.6 || daysPerWeek >= 0.8)
  if (input.groupCount > 2 && almostDaily) return 'high'
  if (weekly) return 'medium'
  return 'small'
}

export function analyzeCalendarUsage(data: {
  events?: unknown[]
  meets?: unknown[]
}): CalendarUsage {
  const events = Array.isArray(data.events) ? data.events : []
  const meets = Array.isArray(data.meets) ? data.meets : []
  const { occurrences } = expandEventsInRange(
    events,
    USAGE_RANGE_START,
    USAGE_RANGE_END,
  )

  const practices = occurrences.filter(
    (o) => o.label === 'practice' && !looksLikeCancel(o.name),
  )
  const teamEvents = occurrences.filter((o) => o.label === 'event')
  const practiceDays = new Set(practices.map((p) => ymdUtc(p.start)))
  const weeksWithPractice = new Set(practices.map((p) => weekKey(p.start)))
  const groups = new Set(practices.map((p) => practiceGroupKey(p.name)).filter(Boolean))
  const windowWeeks = windowWeekCount(USAGE_RANGE_START, USAGE_RANGE_END)
  const practiceCount = practices.length
  const groupCount = groups.size
  const days = practiceDays.size
  const weeksHit = weeksWithPractice.size

  return {
    level: classifyCalendarUsage({
      practiceCount,
      groupCount,
      practiceDays: days,
      weeksWithPractice: weeksHit,
      windowWeeks,
    }),
    practiceCount,
    eventCount: teamEvents.length,
    meetCount: countMeets(meets, USAGE_RANGE_START, USAGE_RANGE_END),
    groupCount,
    practiceDays: days,
    weeksWithPractice: weeksHit,
    windowWeeks,
    daysPerWeek: Math.round((days / Math.max(1, windowWeeks)) * 10) / 10,
  }
}
