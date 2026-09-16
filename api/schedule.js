/**
 * GET /api/schedule
 *
 * Public, unauthenticated schedule lookup for voice assistants:
 *   /api/schedule?team=DelmarDolfins&group=Sr&date=today
 *   /api/schedule?team=DelmarDolfins&group=senior&date=tomorrow
 *   /api/schedule?team=DelmarDolfins&group=Sr&date=2026-09-16
 *   /api/schedule?team=1&include=meets,events&date=today
 *   /api/schedule?team=1&group=Sr,Jr&include=all&date=today
 *
 * Optional format=spoken returns the `spoken` field as text/plain (Siri Shortcuts).
 * GET without team/group returns usage + OpenAPI link.
 *
 * Traffic far above team size trips a per-team hourly circuit (HTTP 429).
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
import {
  buildSchedulePayload,
  expandScheduleDay,
  fetchCommitBundle,
  filterDaySessions,
  formatSession,
  parseInclude,
  resolveGroups,
  resolveQueryDate,
} from './_lib/schedule/publicQuery.js'
import { consumePublicApiQuota } from './_lib/schedule/rateLimit.js'
import { getTenantBySlug, listTenants } from './_lib/tenants.js'

const CACHE_TTL_SEC = 120
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

  const format = queryParam(req, 'format').trim().toLowerCase()
  const teamRaw =
    queryParam(req, 'team') ||
    queryParam(req, 'tenant') ||
    queryParam(req, 'slug')
  const groupRaw = [
    ...queryParamAll(req, 'group'),
    ...queryParamAll(req, 'groups'),
  ].join(',')
  const dateRaw = queryParam(req, 'date') || queryParam(req, 'day')
  const includeRaw = queryParam(req, 'include') || queryParam(req, 'kind')

  if (format === 'openapi') {
    sendJson(res, 200, { spec: OPENAPI_PATH, url: absoluteUrl(req, OPENAPI_PATH) })
    return
  }

  if (!teamRaw && !groupRaw && !dateRaw) {
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

  const previewRange = resolveQueryDate(dateRaw, tenant.defaultTimeZone)
  if (previewRange.error) {
    sendJson(res, 400, { error: previewRange.error })
    return
  }

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
    const bundle = await loadCommitBundleCached(tenant)
    const range = resolveQueryDate(dateRaw, bundle.timeZone)
    if (range.error) {
      sendJson(res, 400, { error: range.error }, rateHeaders)
      return
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

    if (format === 'spoken' || format === 'text') {
      sendText(res, 200, payload.spoken, 'text/plain', rateHeaders)
      return
    }

    sendJson(res, 200, payload, rateHeaders)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Schedule lookup failed'
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

async function loadCommitBundleCached(tenant) {
  const cacheKey = `msd:pubcache:v2:${tenant.slug}`
  if (isRedisConfigured()) {
    try {
      const raw = await redisCommand('GET', cacheKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.schedule && parsed?.timeZone) return parsed
      }
    } catch {
      // continue to live fetch
    }
  }

  const bundle = await fetchCommitBundle(tenant, true)
  if (isRedisConfigured()) {
    try {
      await redisCommand(
        'SET',
        cacheKey,
        JSON.stringify({
          timeZone: bundle.timeZone,
          schedule: bundle.schedule,
        }),
        'EX',
        String(CACHE_TTL_SEC),
      )
    } catch {
      // cache is optional
    }
  }
  return bundle
}

function absoluteUrl(req, path) {
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host
  const proto = req.headers?.['x-forwarded-proto'] || 'https'
  if (host) return `${proto}://${host}${path}`
  return `https://myswimday.com${path}`
}

function usagePayload(req) {
  const example =
    '/api/schedule?team=DelmarDolfins&group=Sr&date=today'
  return {
    product: 'My Swim Day',
    docs: absoluteUrl(req, OPENAPI_PATH),
    usage: {
      method: 'GET',
      path: '/api/schedule',
      query: {
        team: 'Tenant slug or alias (DelmarDolfins, DelmarDolphins, VortexSwimClub, …)',
        group: 'One or more groups: Sr, Sr,Jr, senior and junior (also group=Sr&group=Jr)',
        date: 'today | tomorrow | this Friday | next Monday | YYYY-MM-DD',
        include: 'practice (default) | meets | events | all | meets,events',
        format: 'json (default) | spoken',
      },
    },
    examples: [
      example,
      '/api/schedule?team=DelmarDolfins&group=senior&date=tomorrow',
      '/api/schedule?team=DelmarDolfins&group=Sr&date=this%20Friday',
      '/api/schedule?team=DelmarDolfins&group=Sr&date=next%20Monday',
      '/api/schedule?team=DelmarDolfins&group=Sr,Jr&date=today',
      '/api/schedule?team=1&group=Sr,Jr,Jr%20Prep,DEVO&date=today&include=all&format=spoken',
      '/api/schedule?team=1&date=today&include=meets,events&format=spoken',
    ],
    tenants: listTenants().map((t) => ({
      slug: t.slug,
      displayName: t.displayName,
      aliases: t.slugAliases ?? [],
      groups: (t.groups ?? []).map((g) => g.id),
      timeZone: t.defaultTimeZone,
    })),
    notes: [
      'No API key. Returns the same public practice, meet, and team-event times shown on the team calendar.',
      'Hourly limits scale with team size. Excess traffic pauses that team’s API (HTTP 429) until the window resets.',
    ],
  }
}
