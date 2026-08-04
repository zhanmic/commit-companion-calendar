/**
 * GET /api/cron/send-digests
 *
 * Hourly Vercel Cron (see vercel.json). For each tenant, sends digests only
 * when that tenant’s local clock matches its send hour:
 * - daily  → local hour === dailySendHour (default 7)
 * - weekly → Sunday + local hour === weeklySendHour (default 18)
 *
 * Query:
 * - frequency=daily|weekly — only consider that frequency
 * - force=1 — ignore local hour (manual backfill; still respects already-sent)
 *
 * Auth: Authorization: Bearer $CRON_SECRET
 */
import { digestEmailContent } from '../_lib/email.js'
import { appBaseUrl, sendJson } from '../_lib/http.js'
import { isRedisConfigured } from '../_lib/redis.js'
import { isResendConfigured, sendEmail } from '../_lib/resend.js'
import {
  filterDigest,
  loadScheduleWindow,
} from '../_lib/schedule/digest.js'
import { localClock } from '../_lib/schedule/week.js'
import {
  listActiveByFrequency,
  markSent,
} from '../_lib/subscribeStore.js'
import { listDigestTenants } from '../_lib/tenants.js'

export default async function handler(req, res) {
  const frequency =
    typeof req.query?.frequency === 'string'
      ? req.query.frequency
      : typeof req.query?.mode === 'string'
        ? req.query.mode
        : ''
  const force =
    req.query?.force === '1' ||
    req.query?.force === 'true' ||
    req.query?.force === true
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

    const dailyDue =
      wantDaily && (force || clock.hour === dailyHour)
    const weeklyDue =
      wantWeekly &&
      (force || (clock.weekday === 0 && clock.hour === weeklyHour))

    tenantSummary.dailyDue = dailyDue
    tenantSummary.weeklyDue = weeklyDue

    if (dailyDue) {
      const result = await sendForFrequency({
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
      const result = await sendForFrequency({
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
  const header = req.headers.authorization || ''
  if (header === `Bearer ${secret}`) return true
  const querySecret =
    typeof req.query?.secret === 'string' ? req.query.secret : ''
  return querySecret === secret
}

async function sendForFrequency({ tenant, frequency, now, base }) {
  const subs = await listActiveByFrequency(frequency, tenant.slug)
  let sent = 0
  let skipped = 0
  const errors = []

  if (subs.length === 0) return { sent, skipped, errors }

  let window
  try {
    window = await loadScheduleWindow(tenant, {
      frequency,
      now,
      includeMeets: true,
    })
  } catch (err) {
    errors.push({
      tenant: tenant.slug,
      frequency,
      error: err instanceof Error ? err.message : 'schedule load failed',
    })
    return { sent, skipped, errors }
  }

  for (const sub of subs) {
    try {
      const digest = filterDigest(tenant, sub, window)
      const already =
        frequency === 'daily'
          ? sub.lastDailySentOn === digest.rangeKey
          : sub.lastWeeklySentOn === digest.rangeKey
      if (already) {
        skipped += 1
        continue
      }

      const unsubscribeUrl = `${base}/api/unsubscribe?token=${encodeURIComponent(sub.unsubscribeToken)}`
      const scheduleUrl = `${base}${tenant.path}`
      const content = digestEmailContent({
        digest,
        tenantName: tenant.displayName,
        scheduleUrl,
        unsubscribeUrl,
        frequency,
      })

      await sendEmail({
        to: sub.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
        headers: content.headers,
      })

      await markSent(sub, {
        dailyOn: frequency === 'daily' ? digest.rangeKey : undefined,
        weeklyOn: frequency === 'weekly' ? digest.rangeKey : undefined,
      })
      sent += 1
    } catch (err) {
      console.error('digest send failed', tenant.slug, sub.email, err)
      errors.push({
        email: sub.email,
        tenant: tenant.slug,
        frequency,
        error: err instanceof Error ? err.message : 'send failed',
      })
    }
  }

  return { sent, skipped, errors }
}
