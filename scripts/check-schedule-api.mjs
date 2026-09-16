/**
 * Live check: expand today's (or a given day's) public API payload from Commit.
 *
 * Usage:
 *   node scripts/check-schedule-api.mjs DelmarDolfins Sr today
 *   node scripts/check-schedule-api.mjs DelmarDolfins senior tomorrow
 *   node scripts/check-schedule-api.mjs DelmarDolfins Sr,Jr today
 */
import { getTenantBySlug, listTenants } from '../api/_lib/tenants.js'
import {
  buildSchedulePayload,
  expandPracticeDay,
  fetchCommitBundle,
  filterDaySessions,
  formatSession,
  resolveGroups,
  resolveQueryDate,
} from '../api/_lib/schedule/publicQuery.js'

const [slug, groupRaw, dateRaw] = process.argv.slice(2)
const tenant = getTenantBySlug(slug)
if (!tenant) {
  console.error(
    `Unknown tenant "${slug ?? ''}". Try one of: ${listTenants()
      .map((t) => t.slug)
      .join(', ')}`,
  )
  process.exit(1)
}

const groupResult = resolveGroups(
  tenant,
  groupRaw || tenant.defaultGroups?.[0] || 'Sr',
)
if (groupResult.error) {
  console.error(groupResult.error)
  process.exit(1)
}

const bundle = await fetchCommitBundle(tenant, false)
const range = resolveQueryDate(dateRaw || 'today', bundle.timeZone)
if (range.error) {
  console.error(range.error)
  process.exit(1)
}

const { parsers, occurrences } = expandPracticeDay(
  tenant,
  bundle.schedule,
  bundle.timeZone,
  range,
)
const matched = filterDaySessions(occurrences, groupResult.groups, parsers)
const sessions = matched.map((occ) => formatSession(occ, bundle.timeZone))
const payload = buildSchedulePayload({
  tenant,
  groups: groupResult.groups,
  range,
  timeZone: bundle.timeZone,
  sessions,
})

console.log(JSON.stringify(payload, null, 2))
