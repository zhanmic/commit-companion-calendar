/**
 * Public schedule API: resolve team/group/date and format times + locations
 * for voice assistants (Siri Shortcuts, Alexa, ChatGPT).
 */
import { fetchScheduleData, fetchTeamConfig } from './commit.js'
import { expandEvents } from './expand.js'
import { getTenantParsers } from './parse.js'
import {
  formatClock,
  formatTimeRange,
  getDayRange,
  getDayRangeForDateKey,
} from './week.js'

/** Spoken / URL nicknames → canonical group id (applied only if the tenant has it). */
const GROUP_ALIASES = {
  senior: 'Sr',
  seniors: 'Sr',
  sr: 'Sr',
  junior: 'Jr',
  juniors: 'Jr',
  jr: 'Jr',
  jrprep: 'Jr Prep',
  juniorprep: 'Jr Prep',
  juniorsprep: 'Jr Prep',
  devo: 'DEVO',
  developmental: 'DEVO',
  development: 'DEVO',
  srjr: 'Sr/Jr',
  seniorjr: 'Sr/Jr',
  seniorjunior: 'Sr/Jr',
  seniorsjunior: 'Sr/Jr',
  agegroup: 'Age Group',
  agegroups: 'Age Group',
}

export function foldGroupKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

export function resolveGroup(tenant, raw) {
  const groups = tenant?.groups ?? []
  const input = typeof raw === 'string' ? raw.trim() : ''
  if (!input) {
    return {
      error: 'Missing group. Pass group= (for example Sr or senior).',
      groups,
    }
  }

  const folded = foldGroupKey(input)
  for (const group of groups) {
    if (group.id.toLowerCase() === input.toLowerCase()) return { group }
    if (group.label.toLowerCase() === input.toLowerCase()) return { group }
    if (
      foldGroupKey(group.id) === folded ||
      foldGroupKey(group.label) === folded
    ) {
      return { group }
    }
  }

  const aliasedId = GROUP_ALIASES[folded]
  if (aliasedId) {
    const group = groups.find(
      (g) => g.id === aliasedId || foldGroupKey(g.id) === foldGroupKey(aliasedId),
    )
    if (group) return { group }
  }

  return {
    error: `Unknown group "${input}".`,
    groups,
  }
}

/** Shift a yyyy-MM-dd key by whole calendar days (timezone-independent). */
export function shiftDateKey(dayKey, deltaDays) {
  const year = Number(dayKey.slice(0, 4))
  const month = Number(dayKey.slice(5, 7))
  const date = Number(dayKey.slice(8, 10))
  const utc = new Date(Date.UTC(year, month - 1, date + deltaDays))
  const yyyy = String(utc.getUTCFullYear())
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(utc.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function rangeWithRelative(range, relative) {
  return { ...range, relative }
}

const DATE_HELP =
  'Invalid date. Use today, tomorrow, this Friday, next Monday, or a calendar day like 2026-09-16.'

/** Longest names first so "thursday" wins over "thu". */
const WEEKDAY_NAMES = [
  { name: 'thursday', label: 'Thursday', dow: 4 },
  { name: 'wednesday', label: 'Wednesday', dow: 3 },
  { name: 'saturday', label: 'Saturday', dow: 6 },
  { name: 'tuesday', label: 'Tuesday', dow: 2 },
  { name: 'sunday', label: 'Sunday', dow: 0 },
  { name: 'monday', label: 'Monday', dow: 1 },
  { name: 'friday', label: 'Friday', dow: 5 },
  { name: 'thurs', label: 'Thursday', dow: 4 },
  { name: 'tues', label: 'Tuesday', dow: 2 },
  { name: 'thur', label: 'Thursday', dow: 4 },
  { name: 'thu', label: 'Thursday', dow: 4 },
  { name: 'wed', label: 'Wednesday', dow: 3 },
  { name: 'tue', label: 'Tuesday', dow: 2 },
  { name: 'sun', label: 'Sunday', dow: 0 },
  { name: 'mon', label: 'Monday', dow: 1 },
  { name: 'fri', label: 'Friday', dow: 5 },
  { name: 'sat', label: 'Saturday', dow: 6 },
]

const WEEKDAY_PREFIXES = [
  { prefix: 'thiscoming', modifier: 'upcoming' },
  { prefix: 'nextweek', modifier: 'next' },
  { prefix: 'thisweek', modifier: 'this' },
  { prefix: 'coming', modifier: 'upcoming' },
  { prefix: 'this', modifier: 'this' },
  { prefix: 'next', modifier: 'next' },
]

export function compactDateToken(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[+_]/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * this Friday / next Monday / Friday / this week Friday.
 * `this` = that day in the current Sun–Sat team week (may be past).
 * `next` = the same weekday of next week.
 * Bare / coming = the next occurrence, including today.
 */
export function parseWeekdayPhrase(raw) {
  const compact = compactDateToken(raw)
  if (!compact) return null

  for (const weekday of WEEKDAY_NAMES) {
    if (!compact.endsWith(weekday.name)) continue
    const prefix = compact.slice(0, -weekday.name.length)
    if (prefix === '') {
      return { modifier: 'upcoming', ...weekday }
    }
    const matched = WEEKDAY_PREFIXES.find((entry) => entry.prefix === prefix)
    if (matched) {
      return { modifier: matched.modifier, ...weekday }
    }
  }
  return null
}

export function weekdayFromDateKey(dayKey) {
  const year = Number(dayKey.slice(0, 4))
  const month = Number(dayKey.slice(5, 7))
  const date = Number(dayKey.slice(8, 10))
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay()
}

export function weekdayDateKey(todayKey, targetDow, modifier) {
  const todayDow = weekdayFromDateKey(todayKey)
  if (modifier === 'this' || modifier === 'next') {
    const thisWeekKey = shiftDateKey(todayKey, targetDow - todayDow)
    if (modifier === 'this') return thisWeekKey
    return shiftDateKey(thisWeekKey, 7)
  }
  const delta = (targetDow - todayDow + 7) % 7
  return shiftDateKey(todayKey, delta)
}

function weekdaySpoken(parsed) {
  if (parsed.modifier === 'this') return `this ${parsed.label}`
  if (parsed.modifier === 'next') return `next ${parsed.label}`
  return parsed.label
}

/**
 * `today` / `tomorrow` / `this Friday` / `next Monday` / `YYYY-MM-DD`
 * in the team timezone. `relative` is used in the spoken sentence.
 */
export function resolveQueryDate(raw, timeZone, now = new Date()) {
  const value = String(raw ?? 'today')
    .trim()
    .toLowerCase()
  const token = value || 'today'
  const today = getDayRange(now, timeZone)

  if (token === 'today') {
    return rangeWithRelative(today, 'today')
  }
  if (token === 'tomorrow') {
    const range = getDayRangeForDateKey(shiftDateKey(today.dayKey, 1), timeZone)
    if (!range) {
      return { error: 'Could not resolve tomorrow in this timezone.' }
    }
    return rangeWithRelative(range, 'tomorrow')
  }
  if (token === 'yesterday') {
    const range = getDayRangeForDateKey(shiftDateKey(today.dayKey, -1), timeZone)
    if (!range) {
      return { error: 'Could not resolve yesterday in this timezone.' }
    }
    return rangeWithRelative(range, 'date')
  }

  const weekday = parseWeekdayPhrase(token)
  if (weekday) {
    const dayKey = weekdayDateKey(today.dayKey, weekday.dow, weekday.modifier)
    const range = getDayRangeForDateKey(dayKey, timeZone)
    if (!range) {
      return { error: DATE_HELP }
    }
    return rangeWithRelative(range, weekdaySpoken(weekday))
  }

  const isoToken = token.replace(/[/.]/g, '-').slice(0, 10)
  const range = getDayRangeForDateKey(
    /^\d{4}-\d{2}-\d{2}$/.test(isoToken) ? isoToken : token,
    timeZone,
  )
  if (!range) {
    return { error: DATE_HELP }
  }

  return rangeWithRelative(range, 'date')
}

export function formatSession(occ, timeZone) {
  return {
    kind:
      occ.label === 'meet' ? 'meet' : occ.label === 'event' ? 'event' : 'practice',
    name: occ.name,
    time: formatTimeRange(occ.start, occ.end, timeZone),
    startTime: formatClock(occ.start, timeZone),
    endTime: formatClock(occ.end, timeZone),
    location: occ.location || null,
    groups: Array.isArray(occ.subTeams)
      ? occ.subTeams.filter((g) => typeof g === 'string' && g.trim())
      : [],
  }
}

export function buildSpoken({
  teamName,
  groupLabel,
  relative,
  dateLabel,
  sessions,
}) {
  const when =
    relative === 'today' || relative === 'tomorrow'
      ? relative
      : relative && relative !== 'date'
        ? relative
        : `on ${dateLabel}`

  if (!sessions.length) {
    return `There is no ${groupLabel} practice for ${teamName} ${when}.`
  }

  const bits = sessions.map((session) => {
    const loc = session.location ? ` at ${session.location}` : ''
    if (session.startTime === session.endTime) {
      return `${session.startTime}${loc}`
    }
    return `${session.startTime} to ${session.endTime}${loc}`
  })

  if (bits.length === 1) {
    return `${groupLabel} practice for ${teamName} ${when} is ${bits[0]}.`
  }

  const last = bits[bits.length - 1]
  const head = bits.slice(0, -1).join(', ')
  return `${groupLabel} practice for ${teamName} ${when}: ${head}, and ${last}.`
}

export async function fetchCommitBundle(tenant, includeMeets = false) {
  const [config, schedule] = await Promise.all([
    fetchTeamConfig(tenant.superTeamId),
    fetchScheduleData(tenant.superTeamId, includeMeets),
  ])
  const timeZone = config.superTeam?.timezone || tenant.defaultTimeZone
  return { config, schedule, timeZone }
}

export function expandPracticeDay(tenant, schedule, timeZone, range) {
  const parsers = getTenantParsers(tenant)
  const occurrences = expandEvents(
    (schedule.events ?? []).filter((event) => event.label === 'practice'),
    range.rangeStart,
    range.rangeEnd,
    {
      timeZone,
      practiceNameFormat: tenant.practiceNameFormat,
      parsePractice: parsers.parsePractice,
    },
  )
  return { parsers, occurrences }
}

export function filterDaySessions(occurrences, group, parsers) {
  const selected = new Set([group.id])
  return occurrences.filter((occ) => {
    if (occ.label && occ.label !== 'practice') return false
    return parsers.occurrenceMatchesTeams(occ.subTeams ?? [], selected)
  })
}

export function buildSchedulePayload({
  tenant,
  group,
  range,
  timeZone,
  sessions,
}) {
  const empty = sessions.length === 0
  const spoken = buildSpoken({
    teamName: tenant.displayName,
    groupLabel: group.label,
    relative: range.relative,
    dateLabel: range.label,
    sessions,
  })
  return {
    ok: true,
    team: tenant.displayName,
    teamSlug: tenant.slug,
    group: group.id,
    groupLabel: group.label,
    date: range.dayKey,
    dateLabel: range.label,
    timeZone,
    sessions,
    spoken,
    empty,
  }
}
