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

/** Filter a preloaded window for one subscription. */
export function filterDigest(tenant, subscription, window) {
  const { parsers, range, occurrences, tz } = window
  const selectedGroups = resolveSelectedGroups(tenant, subscription.groups)
  const selected = new Set(selectedGroups)

  const filtered = occurrences.filter((occ) => {
    if (occ.label === 'meet') return Boolean(subscription.includeMeets)
    if (occ.label === 'event') return Boolean(subscription.includeEvents)
    return parsers.occurrenceMatchesTeams(occ.subTeams ?? [], selected)
  })

  const rows = filtered.map((occ) => ({
    day: formatOccDay(occ.start, tz),
    time: formatTimeRange(occ.start, occ.end, tz),
    name: occ.name,
    location: occ.location,
    groups: (occ.subTeams ?? []).join(', '),
    kind: occ.label || 'practice',
  }))

  const periodLabel = subscription.frequency === 'daily' ? 'Daily' : 'Weekly'
  const groupLabel =
    selectedGroups.length === groupIds(tenant).length
      ? 'all groups'
      : selectedGroups.join(', ')

  return {
    title: `${tenant.displayName} · ${periodLabel} schedule`,
    subtitle: `${range.label} · ${groupLabel}`,
    rows,
    empty: rows.length === 0,
    rangeKey:
      subscription.frequency === 'daily' ? range.dayKey : range.weekStartKey,
  }
}

export async function buildDigest(
  tenant,
  subscription,
  { now = new Date() } = {},
) {
  const window = await loadScheduleWindow(tenant, {
    frequency: subscription.frequency,
    now,
    includeMeets: true,
  })
  return filterDigest(tenant, subscription, window)
}

function resolveSelectedGroups(tenant, groups) {
  const all = groupIds(tenant)
  if (!Array.isArray(groups) || groups.length === 0) return all
  const allowed = new Set(all)
  const selected = groups.filter((g) => allowed.has(g))
  return selected.length ? selected : all
}
