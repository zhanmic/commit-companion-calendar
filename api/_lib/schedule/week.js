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

export function formatTimeRange(start, end, timeZone) {
  const s = toZonedTime(start, timeZone)
  const e = toZonedTime(end, timeZone)
  return `${format(s, 'h:mm a')} – ${format(e, 'h:mm a')}`
}

export function formatOccDay(start, timeZone) {
  return format(toZonedTime(start, timeZone), 'EEE MMM d')
}
