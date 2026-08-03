/**
 * GET /api/cron/send-digests
 *
 * Vercel Cron entrypoints (see vercel.json):
 * - ?mode=daily  — ~07:00 America/New_York (11:00 UTC)
 * - ?mode=weekly — Sunday ~18:00 America/New_York (22:00 UTC)
 *
 * Without mode, falls back to local-hour matching (useful for manual runs).
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
  const mode =
    typeof req.query?.mode === 'string' ? req.query.mode : ''
  return runSendDigests(req, res, mode)
}

/** Shared entry for /api/cron/send-daily and /api/cron/send-weekly. */
export async function runSendDigests(req, res, mode = '') {
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
  const summary = {
    checkedAt: now.toISOString(),
    mode: mode || 'auto',
    tenants: [],
    sent: 0,
    skipped: 0,
    errors: [],
  }


  for (const tenant of listDigestTenants()) {
    const tz = tenant.defaultTimeZone || 'America/New_York'
    const clock = localClock(now, tz)
    const tenantSummary = {
      slug: tenant.slug,
      localHour: clock.hour,
      weekday: clock.weekday,
      daily: 0,
      weekly: 0,
    }

    const dailyDue =
      mode === 'daily' ||
      (!mode && clock.hour === (tenant.dailySendHour ?? 7))
    const weeklyDue =
      mode === 'weekly' ||
      (!mode &&
        clock.weekday === 0 &&
        clock.hour === (tenant.weeklySendHour ?? 18))

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
