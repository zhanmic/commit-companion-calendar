/**
 * Print a tenant's expanded week from live Commit data, in the team timezone.
 * Handy for diffing against the team's own Commit website calendar.
 *
 * Usage: node scripts/check-week.mjs <tenantSlug> [YYYY-MM-DD]
 *   node scripts/check-week.mjs VortexSwimClub 2026-09-07
 */
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { expandEvents } from '../api/_lib/schedule/expand.js'
import { getWeekRange } from '../api/_lib/schedule/week.js'
import { getTenantBySlug, listTenants } from '../api/_lib/tenants.js'

const API_BASE = 'https://utility.commitswimming.com'

const [slug, anchorIso] = process.argv.slice(2)
const tenant = getTenantBySlug(slug)
if (!tenant) {
  console.error(
    `Unknown tenant "${slug ?? ''}". Try one of: ${listTenants()
      .map((t) => t.slug)
      .join(', ')}`,
  )
  process.exit(1)
}

const [config, schedule] = await Promise.all([
  fetch(`${API_BASE}/website-data-2a?superTeamId=${tenant.superTeamId}`).then(
    (r) => r.json(),
  ),
  fetch(
    `${API_BASE}/website-data-2b?superTeamId=${tenant.superTeamId}&includeMeets=false`,
  ).then((r) => r.json()),
])

const timeZone = config.superTeam?.timezone ?? tenant.defaultTimeZone
const anchor = anchorIso ? new Date(`${anchorIso}T12:00:00Z`) : new Date()
const { rangeStart, rangeEnd, label } = getWeekRange(anchor, timeZone)

const occurrences = expandEvents(
  (schedule.events ?? []).filter((e) => e.label === 'practice'),
  rangeStart,
  rangeEnd,
  {
    timeZone,
    practiceNameFormat: tenant.practiceNameFormat,
    parsePractice: (name) => ({ subTeams: [name], location: null }),
  },
)

console.log(
  `${tenant.displayName} · ${label} · ${timeZone} · ${occurrences.length} practices`,
)

let day = ''
for (const occ of occurrences) {
  const start = toZonedTime(occ.start, timeZone)
  const end = toZonedTime(occ.end, timeZone)
  const heading = format(start, 'EEE MMM d')
  if (heading !== day) {
    day = heading
    console.log(`\n${heading}`)
  }
  console.log(
    `  ${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}  ${occ.name}`,
  )
}
