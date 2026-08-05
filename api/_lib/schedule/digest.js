import { groupIds } from '../tenants.js'
import { fetchScheduleData, fetchTeamConfig } from './commit.js'
import { expandEvents, expandMeets } from './expand.js'
import { getTenantParsers } from './parse.js'
import {
  formatOccDay,
  formatTimeRange,
  getDayRange,
  getWeekRange,
} from './week.js'

/**
 * Fetch + expand a tenant schedule window once (shared across subscribers).
 */
export async function loadScheduleWindow(
  tenant,
  { frequency, now = new Date(), includeMeets = true } = {},
) {
  const parsers = getTenantParsers(tenant)
  const [config, schedule] = await Promise.all([
    fetchTeamConfig(tenant.superTeamId),
    fetchScheduleData(tenant.superTeamId, includeMeets),
  ])
  const tz = config.superTeam?.timezone || tenant.defaultTimeZone

  const range =
    frequency === 'daily' ? getDayRange(now, tz) : getWeekRange(now, tz)

  const expandOpts = {
    timeZone: tz,
    practiceNameFormat: tenant.practiceNameFormat,
    parsePractice: parsers.parsePractice,
  }

  const practicesAndEvents = expandEvents(
    schedule.events ?? [],
    range.rangeStart,
    range.rangeEnd,
    expandOpts,
  )
  const meets = includeMeets
    ? expandMeets(
        schedule.meets ?? [],
        range.rangeStart,
        range.rangeEnd,
        parsers.parseMeet,
      )
    : []

  return {
    tz,
    range,
    parsers,
    occurrences: [...practicesAndEvents, ...meets].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    ),
  }
}

/**
 * Meets/events are team-wide. Older subscribe UI defaulted both chips off
 * (page filter defaults), so many subs stored false/false unintentionally —
 * treat that legacy pair as "include both". Explicit mixed prefs are honored.
 */
function resolveKindFlags(subscription) {
  const events = subscription?.includeEvents
  const meets = subscription?.includeMeets
  if (events === false && meets === false) {
    return { includeEvents: true, includeMeets: true }
  }
  return {
    includeEvents: events !== false,
    includeMeets: meets !== false,
  }
}

/**
 * Filter a preloaded window for one subscription.
 * Pass `frequency` when the loaded window may differ from subscription.frequency
 * (e.g. Email me now previewing Weekly while the saved sub is still daily).
 */
export function filterDigest(
  tenant,
  subscription,
  window,
  { frequency } = {},
) {
  const { parsers, range, occurrences, tz } = window
  const selectedGroups = resolveSelectedGroups(tenant, subscription.groups)
  const selected = new Set(selectedGroups)
  const { includeEvents, includeMeets } = resolveKindFlags(subscription)
  const freq = resolveFrequency(frequency || subscription.frequency, range)

  const filtered = occurrences.filter((occ) => {
    if (occ.label === 'meet') return includeMeets
    if (occ.label === 'event') return includeEvents
    return parsers.occurrenceMatchesTeams(occ.subTeams ?? [], selected)
  })

  const rows = filtered.map((occ) => {
    const kind = normalizeKind(occ.label)
    const groups = Array.isArray(occ.subTeams)
      ? occ.subTeams.filter((g) => typeof g === 'string' && g.trim())
      : []
    return {
      day: formatOccDay(occ.start, tz),
      time: formatTimeRange(occ.start, occ.end, tz),
      name: occ.name,
      location: kind === 'event' ? null : occ.location,
      groups,
      groupsLabel: groups.join(', '),
      kind,
      kindLabel: kindTitle(kind),
    }
  })

  const periodLabel = freq === 'daily' ? 'Daily' : 'Weekly'
  const groupLabel =
    selectedGroups.length === groupIds(tenant).length
      ? 'all groups'
      : selectedGroups.join(', ')
  const kindBits = [
    includeEvents ? 'events' : null,
    includeMeets ? 'meets' : null,
  ].filter(Boolean)
  const kindLabel = kindBits.length ? ` · ${kindBits.join(' + ')}` : ''

  return {
    title: `${tenant.displayName} · ${periodLabel} schedule`,
    subtitle: `${range.label} · ${groupLabel}${kindLabel}`,
    frequency: freq,
    rows,
    empty: rows.length === 0,
    rangeKey: freq === 'daily' ? range.dayKey : range.weekStartKey,
  }
}

export async function buildDigest(
  tenant,
  subscription,
  { now = new Date(), frequency } = {},
) {
  const freq = frequency || subscription.frequency
  const window = await loadScheduleWindow(tenant, {
    frequency: freq,
    now,
    includeMeets: true,
  })
  return filterDigest(tenant, subscription, window, { frequency: freq })
}

function resolveSelectedGroups(tenant, groups) {
  const all = groupIds(tenant)
  if (!Array.isArray(groups) || groups.length === 0) return all
  const allowed = new Set(all)
  const selected = groups.filter((g) => allowed.has(g))
  return selected.length ? selected : all
}

function normalizeKind(label) {
  if (label === 'meet') return 'meet'
  if (label === 'event') return 'event'
  return 'practice'
}

function kindTitle(kind) {
  if (kind === 'meet') return 'Meet'
  if (kind === 'event') return 'Event'
  return 'Practice'
}

function resolveFrequency(frequency, range) {
  if (frequency === 'daily' || frequency === 'weekly') return frequency
  if (range?.weekStartKey) return 'weekly'
  return 'daily'
}
