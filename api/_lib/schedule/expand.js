import { addDays, addMonths, addYears } from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'

function parseUtc(iso) {
  return new Date(iso)
}

function dayStartMs(date, timeZone) {
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

function momentDay(date, timeZone) {
  return toZonedTime(date, timeZone).getDay()
}

function advanceByPeriod(date, period) {
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

function toOccurrence(event, name, start, end, options) {
  const isTeamEvent = event.label === 'event'
  const parsed = isTeamEvent
    ? { subTeams: [], location: null }
    : options.parsePractice(name, options.practiceNameFormat, {
        description: event.description,
      })

  return {
    id: `${event._id}-${start.getTime()}`,
    name,
    label: event.label,
    start,
    end,
    subTeams: parsed.subTeams,
    location: parsed.location,
  }
}

/**
 * Expand Commit calendar events into concrete occurrences in [rangeStart, rangeEnd).
 * Mirrors `src/lib/expand.ts` (without detail field builders).
 */
export function expandEvents(events, rangeStart, rangeEnd, options) {
  const timeZone = options.timeZone
  const results = []

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

export function expandMeets(meets, rangeStart, rangeEnd, parseMeet) {
  const results = []
  for (const meet of meets) {
    const parsed = parseMeet(meet)
    if (!parsed) continue
    const { start, end, name, location } = parsed
    if (start < rangeStart || start >= rangeEnd) continue
    results.push({
      id: `meet-${meet._id}-${start.getTime()}`,
      name,
      label: 'meet',
      start,
      end,
      subTeams: [],
      location,
    })
  }
  return results.sort((a, b) => a.start.getTime() - b.start.getTime())
}
