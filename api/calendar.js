/**
 * GET /api/calendar
 *
 * Two modes:
 *   1. Live subscription feed (iPhone Calendar / Google “Add by URL”):
 *        /api/calendar?team=1&group=Sr,Jr&include=all
 *      Returns text/calendar. Subscribe with webcal://… or paste the https URL.
 *   2. One-off iOS Quick Look (existing Add to Calendar button):
 *        /api/calendar?d=<base64url of utf-8 ics>
 *
 * Traffic far above team size trips the same per-team hourly circuit as /api/schedule.
 */
import {
  clientIp,
  queryParam,
  queryParamAll,
  sendJson,
  sendText,
  setPublicCors,
} from './_lib/http.js'
import { isRedisConfigured, redisCommand } from './_lib/redis.js'
import { loadCommitBundleCached } from './_lib/schedule/commitCache.js'
import {
  buildIcsCalendar,
  feedCalendarName,
  icsFilename,
} from './_lib/schedule/ics.js'
import {
  expandScheduleDay,
  filterDaySessions,
  parseInclude,
  resolveGroups,
} from './_lib/schedule/publicQuery.js'
import { consumePublicApiQuota } from './_lib/schedule/rateLimit.js'
import { getHorizonRange } from './_lib/schedule/week.js'
import { getTenantBySlug, listTenants } from './_lib/tenants.js'

const ICS_CACHE_TTL_SEC = 300
const DEFAULT_FUTURE_WEEKS = 8
const MAX_FUTURE_WEEKS = 12
const PAST_DAYS = 7
const OPENAPI_PATH = '/openapi.json'

export default async function handler(req, res) {
  setPublicCors(res, 'GET, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, OPTIONS')
    res.end('Method Not Allowed')
    return
  }

  const encoded = queryParam(req, 'd')
  if (encoded) {
    serveEncodedIcs(res, encoded)
    return
  }

  const teamRaw =
    queryParam(req, 'team') ||
    queryParam(req, 'tenant') ||
    queryParam(req, 'slug')
  const groupRaw = [
    ...queryParamAll(req, 'group'),
    ...queryParamAll(req, 'groups'),
  ].join(',')
  const includeRaw = queryParam(req, 'include') || queryParam(req, 'kind')
  const weeksRaw = queryParam(req, 'weeks')

  if (!teamRaw && !groupRaw && !includeRaw) {
    sendJson(res, 200, usagePayload(req))
    return
  }

  const tenant = getTenantBySlug(teamRaw)
  if (!tenant) {
    sendJson(res, 404, {
      error: teamRaw
        ? `Unknown team "${teamRaw}".`
        : 'Missing team. Pass team= (for example DelmarDolfins).',
      teams: listTenants().map((t) => ({
        slug: t.slug,
        displayName: t.displayName,
        aliases: t.slugAliases ?? [],
      })),
    })
    return
  }

  const include = parseInclude(includeRaw)
  if (include.error) {
    sendJson(res, 400, { error: include.error })
    return
  }

  let selectedGroups = []
  if (include.practices) {
    const groupResult = resolveGroups(tenant, groupRaw)
    if (groupResult.error) {
      sendJson(res, 400, {
        error: groupResult.error,
        groups: (tenant.groups ?? []).map((g) => ({ id: g.id, label: g.label })),
      })
      return
    }
    selectedGroups = groupResult.groups
  } else if (groupRaw) {
    const groupResult = resolveGroups(tenant, groupRaw)
    if (!groupResult.error) selectedGroups = groupResult.groups
  }

  const futureWeeks = parseWeeks(weeksRaw)

  const quota = await consumePublicApiQuota({
    tenant,
    ip: clientIp(req),
  })
  const rateHeaders = quota.headers || {}

  if (!quota.allowed) {
    sendJson(
      res,
      429,
      {
        ok: false,
        error: quota.error,
        code: quota.code,
        retryAfterSec: quota.resetSec,
      },
      rateHeaders,
    )
    return
  }

  try {
    const ics = await loadFeedIcs({
      tenant,
      selectedGroups,
      include,
      futureWeeks,
      req,
    })
    sendIcs(res, ics, icsFilename(tenant), rateHeaders)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Calendar lookup failed'
    sendJson(
      res,
      502,
      {
        ok: false,
        error: 'Could not load the live schedule. Try again in a moment.',
        detail: message,
      },
      rateHeaders,
    )
  }
}

function parseWeeks(raw) {
  if (!raw) return DEFAULT_FUTURE_WEEKS
  const n = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n)) return DEFAULT_FUTURE_WEEKS
  return Math.max(1, Math.min(MAX_FUTURE_WEEKS, n))
}

function feedCacheKey(tenant, groups, include, futureWeeks) {
  const groupPart = groups.map((g) => g.id).join(',')
  const kindPart = [
    include.practices ? 'p' : '',
    include.events ? 'e' : '',
    include.meets ? 'm' : '',
  ].join('')
  return `msd:pubics:v1:${tenant.slug}:${groupPart}:${kindPart}:${futureWeeks}`
}

async function loadFeedIcs({ tenant, selectedGroups, include, futureWeeks, req }) {
  const cacheKey = feedCacheKey(tenant, selectedGroups, include, futureWeeks)
  if (isRedisConfigured()) {
    try {
      const cached = await redisCommand('GET', cacheKey)
      if (typeof cached === 'string' && cached.includes('BEGIN:VCALENDAR')) {
        return cached
      }
    } catch {
      // continue to live build
    }
  }

  const bundle = await loadCommitBundleCached(tenant)
  const horizon = getHorizonRange(
    new Date(),
    bundle.timeZone,
    PAST_DAYS,
    futureWeeks,
  )
  const { parsers, occurrences } = expandScheduleDay(
    tenant,
    bundle.schedule,
    bundle.timeZone,
    horizon,
  )
  const matched = filterDaySessions(
    occurrences,
    selectedGroups,
    parsers,
    include,
  )
  const calendarName = feedCalendarName(tenant, selectedGroups, include)
  const sourceLabel = `${tenant.displayName} · My Swim Day`
  const calendarUrl = absoluteUrl(req, tenant.path || `/${tenant.shortSlug || tenant.slug}`)
  const ics = buildIcsCalendar(matched, {
    calendarName,
    timeZone: bundle.timeZone,
    sourceLabel,
    calendarUrl,
    subscribe: true,
  })

  if (isRedisConfigured()) {
    try {
      await redisCommand('SET', cacheKey, ics, 'EX', String(ICS_CACHE_TTL_SEC))
    } catch {
      // cache is optional
    }
  }
  return ics
}

function serveEncodedIcs(res, raw) {
  let ics = ''
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    ics = Buffer.from(padded, 'base64').toString('utf8')
  } catch {
    res.statusCode = 400
    res.end('Invalid calendar payload')
    return
  }

  if (!ics.includes('BEGIN:VCALENDAR')) {
    res.statusCode = 400
    res.end('Invalid calendar content')
    return
  }

  sendIcs(res, ics, 'myswimday.ics', { 'Cache-Control': 'no-store' }, 'inline')
}

function sendIcs(res, ics, filename, headers = {}, disposition = 'attachment') {
  sendText(res, 200, ics, 'text/calendar', {
    'Content-Disposition': `${disposition}; filename="${filename}"`,
    'Cache-Control': 'public, max-age=300',
    ...headers,
  })
}

function absoluteUrl(req, path) {
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host
  const proto = req.headers?.['x-forwarded-proto'] || 'https'
  if (host) return `${proto}://${host}${path}`
  return `https://myswimday.com${path}`
}

function usagePayload(req) {
  const httpsExample =
    '/api/calendar?team=1&group=Sr,Jr,Jr%20Prep,DEVO&include=all'
  return {
    product: 'My Swim Day',
    docs: absoluteUrl(req, OPENAPI_PATH),
    usage: {
      method: 'GET',
      path: '/api/calendar',
      query: {
        team: 'Tenant slug or alias (DelmarDolfins, 1, …)',
        group: 'Practice groups (required unless include is meets/events only)',
        include: 'practice (default) | meets | events | all | meets,events',
        weeks: 'How many weeks ahead (1–12, default 8). Past 7 days always included.',
        d: 'Legacy: base64url of a client-built ICS (one-off Add to Calendar)',
      },
    },
    examples: [
      httpsExample,
      '/api/calendar?team=1&group=Sr',
      '/api/calendar?team=1&include=meets',
      '/api/calendar?team=1&include=meets,events',
    ],
    subscribe: {
      https: absoluteUrl(req, httpsExample),
      webcal: absoluteUrl(req, httpsExample).replace(/^https?:/, 'webcal:'),
      iphone:
        'On iPhone, tap a webcal:// link, or Calendar → Calendars → Add Calendar → Add Subscription Calendar and paste the https URL.',
    },
    tenants: listTenants().map((t) => ({
      slug: t.slug,
      displayName: t.displayName,
      aliases: t.slugAliases ?? [],
      groups: (t.groups ?? []).map((g) => g.id),
      timeZone: t.defaultTimeZone,
    })),
    notes: [
      'No API key. The feed is the same public practice/meet/event times shown on the team calendar.',
      'iPhone Calendar refreshes on its own (typically hours, not seconds). Re-subscribe only if you change groups.',
      'Hourly limits scale with team size. Excess traffic pauses that team’s API (HTTP 429) until the window resets.',
    ],
  }
}
