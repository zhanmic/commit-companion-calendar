/**
 * GET /api/schedule
 *
 * Public, unauthenticated schedule lookup for voice assistants:
 *   /api/schedule?team=DelmarDolfins&group=Sr&date=today
 *   /api/schedule?team=DelmarDolfins&group=senior&date=tomorrow
 *   /api/schedule?team=DelmarDolfins&group=Sr&date=2026-09-16
 *
 * Optional format=spoken returns the `spoken` field as text/plain (Siri Shortcuts).
 * GET without team/group returns usage + OpenAPI link.
 *
 * Traffic far above team size trips a per-team hourly circuit (HTTP 429).
 */
import {
  clientIp,
  queryParam,
  sendJson,
  sendText,
  setPublicCors,
} from './_lib/http.js'
import { isRedisConfigured, redisCommand } from './_lib/redis.js'
import {
  buildSchedulePayload,
  expandPracticeDay,
  fetchCommitBundle,
  filterDaySessions,
  formatSession,
  resolveGroup,
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
  const groupRaw = queryParam(req, 'group')
  const dateRaw = queryParam(req, 'date') || queryParam(req, 'day')

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

  const groupResult = resolveGroup(tenant, groupRaw)
  if (groupResult.error) {
    sendJson(res, 400, {
      error: groupResult.error,
      groups: (tenant.groups ?? []).map((g) => ({ id: g.id, label: g.label })),
    })
    return
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

    const { parsers, occurrences } = expandPracticeDay(
      tenant,
      bundle.schedule,
      bundle.timeZone,
      range,
    )
    const matched = filterDaySessions(occurrences, groupResult.group, parsers)
    const sessions = matched.map((occ) => formatSession(occ, bundle.timeZone))
    const payload = buildSchedulePayload({
      tenant,
      group: groupResult.group,
      range,
      timeZone: bundle.timeZone,
      sessions,
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
  const cacheKey = `msd:pubcache:${tenant.slug}`
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

  const bundle = await fetchCommitBundle(tenant, false)
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
        group: 'Practice group (Sr, senior, Jr, Jr Prep, DEVO, Peak, …)',
        date: 'today | tomorrow | this Friday | next Monday | YYYY-MM-DD',
        format: 'json (default) | spoken',
      },
    },
    examples: [
      example,
      '/api/schedule?team=DelmarDolfins&group=senior&date=tomorrow',
      '/api/schedule?team=DelmarDolfins&group=Sr&date=this%20Friday',
      '/api/schedule?team=DelmarDolfins&group=Sr&date=next%20Monday',
      '/api/schedule?team=DelmarDolfins&group=Sr&date=2026-09-16&format=spoken',
    ],
    tenants: listTenants().map((t) => ({
      slug: t.slug,
      displayName: t.displayName,
      aliases: t.slugAliases ?? [],
      groups: (t.groups ?? []).map((g) => g.id),
      timeZone: t.defaultTimeZone,
    })),
    notes: [
      'No API key. Returns the same public practice times shown on the team calendar.',
      'Hourly limits scale with team size. Excess traffic pauses that team’s API (HTTP 429) until the window resets.',
    ],
  }
}
