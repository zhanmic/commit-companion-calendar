/**
 * Public schedule API rate limits, scaled by team size.
 *
 * A normal household asking Siri a handful of times is well under the cap.
 * A flood (script, misbehaving shortcut, scrape) trips the team circuit:
 * every caller for that team gets 429 until the hour window expires.
 */
import { isRedisConfigured, redisPipeline } from '../redis.js'
import { groupIds } from '../tenants.js'

const WINDOW_SEC = 60 * 60
const MIN_HOURLY = 120
const MAX_HOURLY = 5000
const DEFAULT_ASKS_PER_HOUSEHOLD = 4
const HOUSEHOLDS_PER_GROUP = 35

export function estimatedHouseholds(tenant) {
  const override = Number(tenant?.publicApiHouseholds)
  if (Number.isFinite(override) && override > 0) {
    return Math.floor(override)
  }
  const groups = Math.max(1, groupIds(tenant).length)
  return groups * HOUSEHOLDS_PER_GROUP
}

export function asksPerHouseholdPerHour() {
  const raw = Number(process.env.PUBLIC_API_ASKS_PER_HOUSEHOLD)
  if (Number.isFinite(raw) && raw > 0) return raw
  return DEFAULT_ASKS_PER_HOUSEHOLD
}

/** Hourly request budget for one tenant (all callers combined). */
export function teamHourlyLimit(tenant) {
  const households = estimatedHouseholds(tenant)
  const budget = Math.floor(households * asksPerHouseholdPerHour())
  return Math.min(MAX_HOURLY, Math.max(MIN_HOURLY, budget))
}

/** Per-IP cap so one client cannot burn the whole team budget alone. */
export function ipHourlyLimit(tenant) {
  const team = teamHourlyLimit(tenant)
  return Math.min(60, Math.max(20, Math.ceil(team / 20)))
}

export function rateLimitDisabled() {
  const flag = process.env.PUBLIC_API_DISABLE_RATE_LIMIT
  return flag === '1' || flag === 'true'
}

export function sanitizeIp(ip) {
  return String(ip || 'unknown')
    .replace(/[^a-zA-Z0-9.:_-]/g, '')
    .slice(0, 80) || 'unknown'
}

export function evaluateCounters({ teamCount, ipCount, teamLimit, ipLimit }) {
  if (teamCount > teamLimit) {
    return {
      allowed: false,
      code: 'team_circuit',
      error:
        "This team's public schedule API is paused because of unusually high traffic. Try again later.",
    }
  }
  if (ipCount > ipLimit) {
    return {
      allowed: false,
      code: 'ip_limit',
      error: 'Too many schedule requests from this client. Try again later.',
    }
  }
  return { allowed: true, code: 'ok' }
}

/**
 * Count this request against the tenant + IP windows.
 * Redis missing or errors: fail open (voice still works; attack protection needs Redis).
 */
export async function consumePublicApiQuota({ tenant, ip }) {
  const teamLimit = teamHourlyLimit(tenant)
  const ipLimit = ipHourlyLimit(tenant)
  const headersBase = {
    'X-RateLimit-Limit': String(teamLimit),
    'X-RateLimit-Policy': `team ${teamLimit}/hour; ip ${ipLimit}/hour`,
  }

  if (rateLimitDisabled() || !isRedisConfigured()) {
    return {
      allowed: true,
      skipped: true,
      teamLimit,
      ipLimit,
      remaining: teamLimit,
      resetSec: WINDOW_SEC,
      headers: {
        ...headersBase,
        'X-RateLimit-Remaining': String(teamLimit),
      },
    }
  }

  const slug = tenant.slug
  const ipKey = sanitizeIp(ip)
  const teamRedisKey = `msd:pubapi:team:${slug}`
  const ipRedisKey = `msd:pubapi:ip:${slug}:${ipKey}`

  try {
    const [teamCountRaw, teamTtlRaw, ipCountRaw, ipTtlRaw] = await redisPipeline([
      ['INCR', teamRedisKey],
      ['TTL', teamRedisKey],
      ['INCR', ipRedisKey],
      ['TTL', ipRedisKey],
    ])
    const teamCount = Number(teamCountRaw) || 0
    const ipCount = Number(ipCountRaw) || 0
    const teamTtl = Number(teamTtlRaw)
    const ipTtl = Number(ipTtlRaw)

    const expire = []
    if (!Number.isFinite(teamTtl) || teamTtl < 0) {
      expire.push(['EXPIRE', teamRedisKey, WINDOW_SEC])
    }
    if (!Number.isFinite(ipTtl) || ipTtl < 0) {
      expire.push(['EXPIRE', ipRedisKey, WINDOW_SEC])
    }
    if (expire.length) await redisPipeline(expire)

    const resetSec =
      Number.isFinite(teamTtl) && teamTtl > 0 ? teamTtl : WINDOW_SEC
    const remaining = Math.max(0, teamLimit - teamCount)
    const decision = evaluateCounters({
      teamCount,
      ipCount,
      teamLimit,
      ipLimit,
    })

    const headers = {
      ...headersBase,
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(resetSec),
    }
    if (!decision.allowed) {
      headers['Retry-After'] = String(resetSec)
    }

    return {
      ...decision,
      skipped: false,
      teamCount,
      ipCount,
      teamLimit,
      ipLimit,
      remaining,
      resetSec,
      headers,
    }
  } catch {
    return {
      allowed: true,
      skipped: true,
      teamLimit,
      ipLimit,
      remaining: teamLimit,
      resetSec: WINDOW_SEC,
      headers: {
        ...headersBase,
        'X-RateLimit-Remaining': String(teamLimit),
      },
    }
  }
}
