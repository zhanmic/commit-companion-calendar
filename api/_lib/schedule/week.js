import { addDays, format } from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'

function localParts(date, timeZone) {
  const z = toZonedTime(date, timeZone)
  return {
    year: z.getFullYear(),
    month: z.getMonth(),
    date: z.getDate(),
    day: z.getDay(),
    hour: z.getHours(),
  }
}

function atLocalMidnight(year, month, date, timeZone) {
  return fromZonedTime(new Date(year, month, date, 0, 0, 0, 0), timeZone)
}

/** Sunday–Saturday week containing `anchor`, in tenant timezone. */
export function getWeekRange(anchor, timeZone) {
  const parts = localParts(anchor, timeZone)
  const weekStartDate = parts.date - parts.day
  const rangeStart = atLocalMidnight(
    parts.year,
    parts.month,
    weekStartDate,
    timeZone,
  )
  const startParts = localParts(rangeStart, timeZone)
  const rangeEnd = atLocalMidnight(
    startParts.year,
    startParts.month,
    startParts.date + 7,
    timeZone,
  )

  const startLabel = format(toZonedTime(rangeStart, timeZone), 'MMM d')
  const endLocal = toZonedTime(addDays(rangeStart, 6), timeZone)
  const endLabel =
    startParts.month === endLocal.getMonth()
      ? format(endLocal, 'd, yyyy')
      : format(endLocal, 'MMM d, yyyy')

  return {
    rangeStart,
    rangeEnd,
    label: `${startLabel} – ${endLabel}`,
    weekStartKey: format(toZonedTime(rangeStart, timeZone), 'yyyy-MM-dd'),
  }
}

/** Local calendar day [start, end) for `anchor`. */
export function getDayRange(anchor, timeZone) {
  const parts = localParts(anchor, timeZone)
  const rangeStart = atLocalMidnight(
    parts.year,
    parts.month,
    parts.date,
    timeZone,
  )
  const rangeEnd = atLocalMidnight(
    parts.year,
    parts.month,
    parts.date + 1,
    timeZone,
  )
  const local = toZonedTime(rangeStart, timeZone)
  return {
    rangeStart,
    rangeEnd,
    label: format(local, 'EEEE, MMM d'),
    dayKey: format(local, 'yyyy-MM-dd'),
  }
}

export function localClock(now, timeZone) {
  const parts = localParts(now, timeZone)
  return {
    hour: parts.hour,
    weekday: parts.day, // Sun=0
    dayKey: format(
      toZonedTime(
        atLocalMidnight(parts.year, parts.month, parts.date, timeZone),
        timeZone,
      ),
      'yyyy-MM-dd',
    ),
  }
}

export function formatClock(date, timeZone) {
  return format(toZonedTime(date, timeZone), 'h:mm a')
}

export function formatTimeRange(start, end, timeZone) {
  return `${formatClock(start, timeZone)} – ${formatClock(end, timeZone)}`
}

/**
 * Local calendar day [start, end) for a `yyyy-MM-dd` key in `timeZone`.
 * Returns null when the key is missing, malformed, or not a real calendar day.
 */
export function getDayRangeForDateKey(dateKey, timeZone) {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return null
  }
  const year = Number(dateKey.slice(0, 4))
  const month = Number(dateKey.slice(5, 7)) - 1
  const date = Number(dateKey.slice(8, 10))
  const rangeStart = atLocalMidnight(year, month, date, timeZone)
  const local = toZonedTime(rangeStart, timeZone)
  const dayKey = format(local, 'yyyy-MM-dd')
  if (dayKey !== dateKey) return null
  const rangeEnd = atLocalMidnight(year, month, date + 1, timeZone)
  return {
    rangeStart,
    rangeEnd,
    label: format(local, 'EEEE, MMM d'),
    dayKey,
  }
}

export function formatOccDay(start, timeZone) {
  return format(toZonedTime(start, timeZone), 'EEE MMM d')
}
