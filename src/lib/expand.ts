import { addDays, addMonths, addYears } from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import type { MeetParser, PracticeParser } from '../tenants/types'
import type { CommitEvent, CommitMeet, Occurrence } from '../types'
import { buildEventDetailFields, buildMeetDetailFields } from './detailFields'
import type { PracticeNameFormat } from './settings'

const DEFAULT_TZ = 'America/New_York'

function parseUtc(iso: string): Date {
  return new Date(iso)
}

/** Local midnight epoch-ms in team timezone (matches Commit custom ids). */
function dayStartMs(date: Date, timeZone: string): number {
  const zoned = toZonedTime(date, timeZone)
  const midnightLocal = new Date(
    zoned.getFullYear(),
    zoned.getMonth(),
    zoned.getDate(),
    0,
    0,
    0,
    0,
  )
  return fromZonedTime(midnightLocal, timeZone).getTime()
}

/** Moment-style day(): Sun=0 … Sat=6 in team timezone. */
function momentDay(date: Date, timeZone: string): number {
  return toZonedTime(date, timeZone).getDay()
}

function advanceByPeriod(date: Date, period: string): Date {
  switch (period) {
    case 'weekly':
      return addDays(date, 7)
    case 'monthly':
      return addMonths(date, 1)
    case 'yearly':
      return addYears(date, 1)
    case 'weekdays':
    default:
      return addDays(date, 1)
  }
}

export interface ExpandPracticeOptions {
  timeZone?: string
  practiceNameFormat: PracticeNameFormat
  parsePractice: PracticeParser
}

/**
 * Expand Commit calendar events into concrete occurrences in [rangeStart, rangeEnd).
 * Mirrors the recurrence logic used by commitswimming.com website JS.
 * Practice title → group/location is tenant-specific via `parsePractice`.
 */
export function expandEvents(
  events: CommitEvent[],
  rangeStart: Date,
  rangeEnd: Date,
  options: ExpandPracticeOptions,
): Occurrence[] {
  const timeZone = options.timeZone ?? DEFAULT_TZ
  const results: Occurrence[] = []

  for (const event of events) {
    const baseStart = parseUtc(event.startDate)
    const baseEnd = parseUtc(event.endDate)
    const durationMs = baseEnd.getTime() - baseStart.getTime()
    const rec = event.recurring

    if (!rec) {
      if (baseStart >= rangeStart && baseStart < rangeEnd) {
        results.push(toOccurrence(event, event.name, baseStart, baseEnd, options))
      }
      continue
    }

    const until = parseUtc(rec.endDate)
    const allowedDays = new Set(rec.days ?? [1, 2, 3, 4, 5])
    const customs = new Map((rec.custom ?? []).map((c) => [c.id, c]))

    // Commit builds dtstart from UTC Y/M/D/H/M/S components of startDate
    let cursor = new Date(
      Date.UTC(
        baseStart.getUTCFullYear(),
        baseStart.getUTCMonth(),
        baseStart.getUTCDate(),
        baseStart.getUTCHours(),
        baseStart.getUTCMinutes(),
        baseStart.getUTCSeconds(),
      ),
    )
    const untilUtc = new Date(
      Date.UTC(
        until.getUTCFullYear(),
        until.getUTCMonth(),
        until.getUTCDate(),
        until.getUTCHours(),
        until.getUTCMinutes(),
        until.getUTCSeconds(),
      ),
    )

    let guard = 0
    while (cursor <= untilUtc && guard < 800) {
      guard += 1

      if (rec.period === 'weekdays') {
        if (!allowedDays.has(momentDay(cursor, timeZone))) {
          cursor = advanceByPeriod(cursor, rec.period)
          continue
        }
      }

      if (cursor < rangeStart) {
        // still need custom check only if in range; skip early dates cheaply
        if (cursor.getTime() + durationMs < rangeStart.getTime()) {
          cursor = advanceByPeriod(cursor, rec.period)
          continue
        }
      }

      const custom = customs.get(dayStartMs(cursor, timeZone))
      if (custom?.removed) {
        cursor = advanceByPeriod(cursor, rec.period)
        continue
      }

      let occStart = cursor
      let occEnd = new Date(cursor.getTime() + durationMs)
      let name = event.name

      if (custom?.startTime && custom.endTime) {
        occStart = parseUtc(custom.startTime)
        occEnd = parseUtc(custom.endTime)
        name = custom.name || event.name
      }

      if (occStart >= rangeStart && occStart < rangeEnd) {
        results.push(toOccurrence(event, name, occStart, occEnd, options))
      }

      cursor = advanceByPeriod(cursor, rec.period)
    }
  }

  return results.sort((a, b) => a.start.getTime() - b.start.getTime())
}

function toOccurrence(
  event: CommitEvent,
  name: string,
  start: Date,
  end: Date,
  options: ExpandPracticeOptions,
): Occurrence {
  const isTeamEvent = event.label === 'event'
  // Team events are filtered via the Event chip — not mapped onto practice groups.
  const parsed = isTeamEvent
    ? { subTeams: [] as string[], location: null as string | null }
    : options.parsePractice(name, options.practiceNameFormat)

  return {
    id: `${event._id}-${start.getTime()}`,
    sourceId: event._id,
    name,
    label: event.label,
    start,
    end,
    subTeams: parsed.subTeams,
    location: parsed.location,
    fields: buildEventDetailFields(
      event,
      name,
      start,
      end,
      parsed.subTeams,
      parsed.location,
    ),
  }
}

export function expandPractices(
  events: CommitEvent[],
  rangeStart: Date,
  rangeEnd: Date,
  options: ExpandPracticeOptions,
): Occurrence[] {
  return expandEvents(
    events.filter((e) => e.label === 'practice'),
    rangeStart,
    rangeEnd,
    options,
  )
}

/** Convert Commit meets into week occurrences using the tenant's meet parser. */
export function expandMeets(
  meets: CommitMeet[],
  rangeStart: Date,
  rangeEnd: Date,
  parseMeet: MeetParser,
): Occurrence[] {
  const results: Occurrence[] = []

  for (const meet of meets) {
    const parsed = parseMeet(meet)
    if (!parsed) continue
    const { start, end, name, location } = parsed
    if (start < rangeStart || start >= rangeEnd) continue

    results.push({
      id: `meet-${meet._id}-${start.getTime()}`,
      sourceId: meet._id,
      name,
      label: 'meet',
      start,
      end,
      // Groups apply to practices only — meets are filtered via the Meet chip.
      subTeams: [],
      location,
      fields: buildMeetDetailFields(meet, name, start, end, location),
    })
  }

  return results.sort((a, b) => a.start.getTime() - b.start.getTime())
}
