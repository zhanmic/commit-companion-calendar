/**
 * POST /api/send-now
 * Body: { email, tenantSlug, frequency? }
 *
 * Immediately emails a digest for an *active* subscription so the subscriber
 * can preview what mail looks like. Optional `frequency` (daily|weekly) uses
 * the UI selection instead of only the saved subscription frequency.
 * Rate-limited to once per 2 minutes per subscription.
 */
import { appBaseUrl, readJsonBody, sendJson } from './_lib/http.js'
import { isRedisConfigured } from './_lib/redis.js'
import { isResendConfigured } from './_lib/resend.js'
import { sendDigestToSubscription } from './_lib/sendDigest.js'
import { getSubscription, markSent } from './_lib/subscribeStore.js'
import { getTenantBySlug } from './_lib/tenants.js'
import { normalizeEmail } from './_lib/tokens.js'

const COOLDOWN_MS = 2 * 60 * 1000

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'POST, OPTIONS')
    res.end('Method Not Allowed')
    return
  }

  if (!isRedisConfigured() || !isResendConfigured()) {
    sendJson(res, 503, {
      error: 'Email subscriptions are not configured on this environment.',
    })
    return
  }

  const body = readJsonBody(req)
  if (!body) {
    sendJson(res, 400, { error: 'Expected JSON body' })
    return
  }

  const email = normalizeEmail(body.email)
  if (!email) {
    sendJson(res, 400, { error: 'Enter a valid email address' })
    return
  }

  const tenant = getTenantBySlug(body.tenantSlug)
  if (!tenant?.superTeamId) {
    sendJson(res, 400, { error: 'Unknown team' })
    return
  }

  try {
    const subscription = await getSubscription(tenant.slug, email)
    if (!subscription || subscription.status !== 'active') {
      sendJson(res, 400, {
        error:
          'Confirm your subscription first, then try Email me now.',
      })
      return
    }

    const lastManual = subscription.lastManualSentAt
      ? Date.parse(subscription.lastManualSentAt)
      : 0
    if (Number.isFinite(lastManual) && Date.now() - lastManual < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - (Date.now() - lastManual)) / 1000)
      sendJson(res, 429, {
        error: `Wait ${waitSec}s before requesting another email.`,
      })
      return
    }

    const frequency =
      body.frequency === 'daily' || body.frequency === 'weekly'
        ? body.frequency
        : subscription.frequency

    const result = await sendDigestToSubscription(subscription, {
      base: appBaseUrl(req),
      frequency,
      force: true,
    })

    if (!result.sent) {
      sendJson(res, 500, {
        error:
          result.skipped === 'not_active'
            ? 'Confirm your subscription first, then try Email me now.'
            : 'Could not send digest right now.',
      })
      return
    }

    await markSent(subscription, {
      manualAt: new Date().toISOString(),
    })

    const sentFrequency = result.frequency || frequency
    sendJson(res, 200, {
      ok: true,
      frequency: sentFrequency,
      empty: Boolean(result.empty),
      message: result.empty
        ? `Sent — no sessions for your filters right now. Check ${email}.`
        : `Sent — check ${email} for your ${sentFrequency} digest.`,
    })
  } catch (err) {
    console.error('send-now failed', err)
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : 'Send failed',
    })
  }
}
