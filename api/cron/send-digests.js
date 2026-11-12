/**
 * GET /api/cron/send-digests
 *
 * Vercel Cron tick (see vercel.json). Hobby only allows expressions that run
 * once a day, so production registers the UTC hours that cover 7:00 a.m. local
 * (daily) and Sunday 6:00 p.m. local (weekly) for New York, Chicago, and Denver,
 * including daylight saving and a one-hour late tick.
 *
 * Each tick sends only in the local send window (send hour + one catch-up hour):
 * - daily  → local hour in [dailySendHour, dailySendHour+1] (default 7–8)
 * - weekly → Sunday + local hour in [weeklySendHour, weeklySendHour+1] (default 18–19)
 *
 * The extra hour covers a late Hobby tick. Hours after that skip Redis subscriber
 * scans so Fluid Active CPU stays low. If every subscriber was already sent for
 * that day or week, the tick does not load Commit.
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

/** Shared entry for cron ticks. Manual: ?frequency=daily|weekly&force=1 */
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

    // Catch-up: send hour and the next hour only (matches vercel.json late tick).
    // Already-sent markers make the second tick safe.
    const dailyDue =
      wantDaily && (force || isWithinSendWindow(clock.hour, dailyHour))
    const weeklyDue =
      wantWeekly &&
      (force ||
        (clock.weekday === 0 && isWithinSendWindow(clock.hour, weeklyHour)))

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

/** True for the send hour and one late hour (Hobby jitter / missed tick). */
export function isWithinSendWindow(localHour, sendHour, catchUpHours = 1) {
  const hour = Number(localHour)
  const start = Number(sendHour)
  const late = Number(catchUpHours)
  if (!Number.isFinite(hour) || !Number.isFinite(start)) return false
  const extra = Number.isFinite(late) && late >= 0 ? late : 1
  return hour >= start && hour <= start + extra
}
