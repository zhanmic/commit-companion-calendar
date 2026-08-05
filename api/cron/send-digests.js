/**
 * GET /api/cron/send-digests
 *
 * Vercel Cron tick (see vercel.json). Hobby forbids true hourly expressions, so
 * production registers 24 once-daily jobs (one per UTC hour). Each tick sends
 * digests when that tenant’s local clock is at or past its send hour (same day):
 * - daily  → local hour >= dailySendHour (default 7)
 * - weekly → Sunday + local hour >= weeklySendHour (default 18)
 *
 * Using >= (not ===) catches Hobby ±hour jitter and missed ticks; per-subscriber
 * lastDailySentOn / lastWeeklySentOn still prevent double sends.
 *
 * Query:
 * - frequency=daily|weekly — only consider that frequency
 * - force=1 — ignore local hour (manual backfill; still respects already-sent)
 *
 * Auth: Authorization: Bearer $CRON_SECRET
 */
import { appBaseUrl, queryParam, sendJson } from '../_lib/http.js'
import { isRedisConfigured } from '../_lib/redis.js'
import { isResendConfigured } from '../_lib/resend.js'
import { sendDigestsForTenantFrequency } from '../_lib/sendDigest.js'
import { localClock } from '../_lib/schedule/week.js'
import { listDigestTenants } from '../_lib/tenants.js'

export default async function handler(req, res) {
  const frequency = queryParam(req, 'frequency') || queryParam(req, 'mode')
  const force =
    queryParam(req, 'force') === '1' || queryParam(req, 'force') === 'true'
  return runSendDigests(req, res, { frequency, force })
}

/** Shared entry for cron tick + legacy /api/cron/send-daily|weekly. */
export async function runSendDigests(
  req,
  res,
  { frequency = '', force = false } = {},
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, POST')
    res.end('Method Not Allowed')
    return
  }

  if (!authorize(req)) {
    sendJson(res, 401, { error: 'Unauthorized' })
    return
  }

  if (!isRedisConfigured() || !isResendConfigured()) {
    sendJson(res, 503, { error: 'Subscriptions not configured' })
    return
  }

  const now = new Date()
  const base = appBaseUrl(req)
  const freq =
    frequency === 'daily' || frequency === 'weekly' ? frequency : ''
  const summary = {
    checkedAt: now.toISOString(),
    frequency: freq || 'all',
    force: Boolean(force),
    tenants: [],
    sent: 0,
    skipped: 0,
    errors: [],
  }

  for (const tenant of listDigestTenants()) {
    const tz = tenant.defaultTimeZone || 'America/New_York'
    const clock = localClock(now, tz)
    const dailyHour = tenant.dailySendHour ?? 7
    const weeklyHour = tenant.weeklySendHour ?? 18
    const tenantSummary = {
      slug: tenant.slug,
      timeZone: tz,
      localHour: clock.hour,
      weekday: clock.weekday,
      dailyHour,
      weeklyHour,
      daily: 0,
      weekly: 0,
      dailyDue: false,
      weeklyDue: false,
    }

    const wantDaily = !freq || freq === 'daily'
    const wantWeekly = !freq || freq === 'weekly'

    // Catch-up: any tick at or after the send hour (same local day) may send.
    // Already-sent markers make repeated ticks safe.
    const dailyDue =
      wantDaily && (force || clock.hour >= dailyHour)
    const weeklyDue =
      wantWeekly &&
      (force || (clock.weekday === 0 && clock.hour >= weeklyHour))

    tenantSummary.dailyDue = dailyDue
    tenantSummary.weeklyDue = weeklyDue

    if (dailyDue) {
      const result = await sendDigestsForTenantFrequency({
        tenant,
        frequency: 'daily',
        now,
        base,
      })
      tenantSummary.daily = result.sent
      summary.sent += result.sent
      summary.skipped += result.skipped
      summary.errors.push(...result.errors)
    }

    if (weeklyDue) {
      const result = await sendDigestsForTenantFrequency({
        tenant,
        frequency: 'weekly',
        now,
        base,
      })
      tenantSummary.weekly = result.sent
      summary.sent += result.sent
      summary.skipped += result.skipped
      summary.errors.push(...result.errors)
    }

    summary.tenants.push(tenantSummary)
  }

  sendJson(res, 200, summary)
}

function authorize(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return process.env.NODE_ENV !== 'production'
  }
  const header = req.headers.authorization || req.headers.Authorization || ''
  if (header === `Bearer ${secret}`) return true
  return queryParam(req, 'secret') === secret
}
