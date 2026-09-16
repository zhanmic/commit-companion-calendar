/**
 * Live check: expand today's (or a given day's) public API payload from Commit.
 *
 * Usage:
 *   node scripts/check-schedule-api.mjs DelmarDolfins Sr today
 *   node scripts/check-schedule-api.mjs DelmarDolfins senior tomorrow
 *   node scripts/check-schedule-api.mjs DelmarDolfins Sr,Jr today
 *   node scripts/check-schedule-api.mjs DelmarDolfins Sr today all
 *   node scripts/check-schedule-api.mjs DelmarDolfins - today meets,events
 */
import { getTenantBySlug, listTenants } from '../api/_lib/tenants.js'
import {
  buildSchedulePayload,
  expandScheduleDay,
  fetchCommitBundle,
  filterDaySessions,
  formatSession,
  parseInclude,
  resolveGroups,
  resolveQueryDate,
} from '../api/_lib/schedule/publicQuery.js'

const [slug, groupRaw, dateRaw, includeRaw] = process.argv.slice(2)
const tenant = getTenantBySlug(slug)
if (!tenant) {
  console.error(
    `Unknown tenant "${slug ?? ''}". Try one of: ${listTenants()
      .map((t) => t.slug)
      .join(', ')}`,
  )
  process.exit(1)
}

const include = parseInclude(includeRaw)
if (include.error) {
  console.error(include.error)
  process.exit(1)
}

const wantsGroup = include.practices || (groupRaw && groupRaw !== '-')
let selectedGroups = []
if (wantsGroup && groupRaw && groupRaw !== '-') {
  const groupResult = resolveGroups(tenant, groupRaw)
  if (groupResult.error) {
    console.error(groupResult.error)
    process.exit(1)
  }
  selectedGroups = groupResult.groups
} else if (include.practices) {
  const groupResult = resolveGroups(
    tenant,
    tenant.defaultGroups?.[0] || 'Sr',
  )
  if (groupResult.error) {
    console.error(groupResult.error)
    process.exit(1)
  }
  selectedGroups = groupResult.groups
}

const bundle = await fetchCommitBundle(tenant, true)
const range = resolveQueryDate(dateRaw || 'today', bundle.timeZone)
if (range.error) {
  console.error(range.error)
  process.exit(1)
}

const { parsers, occurrences } = expandScheduleDay(
  tenant,
  bundle.schedule,
  bundle.timeZone,
  range,
)
const matched = filterDaySessions(
  occurrences,
  selectedGroups,
  parsers,
  include,
)
const sessions = matched.map((occ) => formatSession(occ, bundle.timeZone))
const payload = buildSchedulePayload({
  tenant,
  groups: selectedGroups,
  range,
  timeZone: bundle.timeZone,
  sessions,
  kinds: include,
})

console.log(JSON.stringify(payload, null, 2))
