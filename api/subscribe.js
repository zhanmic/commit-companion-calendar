/**
 * POST /api/subscribe
 * Body: { email, tenantSlug, frequency, groups?, includeEvents?, includeMeets? }
 *
 * `groups: []` means all tenant groups. Omitted groups → tenant defaults.
 * Double opt-in via Resend confirmation email. Active subscribers can update
 * filters without re-confirming.
 */
import { confirmEmailContent } from './_lib/email.js'
import { appBaseUrl, readJsonBody, sendJson } from './_lib/http.js'
import { isRedisConfigured } from './_lib/redis.js'
import { isResendConfigured, sendEmail } from './_lib/resend.js'
import { upsertSubscription } from './_lib/subscribeStore.js'
import { getTenantBySlug, groupIds } from './_lib/tenants.js'
import { normalizeEmail } from './_lib/tokens.js'

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

  const frequency =
    body.frequency === 'daily'
      ? 'daily'
      : body.frequency === 'weekly'
        ? 'weekly'
        : null
  if (!frequency) {
    sendJson(res, 400, { error: 'Frequency must be daily or weekly' })
    return
  }

  const allowed = groupIds(tenant)
  const allowedSet = new Set(allowed)
  const groups = Array.isArray(body.groups)
    ? body.groups.filter((g) => typeof g === 'string' && allowedSet.has(g))
    : [...(tenant.defaultGroups ?? [])]

  const includeEvents = Boolean(body.includeEvents)
  const includeMeets = Boolean(body.includeMeets)

  try {
    const { subscription, confirmToken } = await upsertSubscription({
      email,
      tenantSlug: tenant.slug,
      frequency,
      groups,
      includeEvents,
      includeMeets,
      timezone: tenant.defaultTimeZone,
    })

    if (!confirmToken) {
      sendJson(res, 200, {
        ok: true,
        status: 'updated',
        message: 'Subscription updated. You are all set.',
      })
      return
    }

    const base = appBaseUrl(req)
    const confirmUrl = `${base}/api/confirm?token=${encodeURIComponent(confirmToken)}`
    const groupsLabel =
      groups.length === 0 || groups.length === allowed.length
        ? 'all groups'
        : groups.join(', ')

    const content = confirmEmailContent({
      tenantName: tenant.displayName,
      confirmUrl,
      frequency,
      groupsLabel,
    })

    await sendEmail({
      to: email,
      subject: content.subject,
      html: content.html,
      text: content.text,
    })

    sendJson(res, 200, {
      ok: true,
      status: subscription.status,
      message: 'Check your email to confirm the subscription.',
    })
  } catch (err) {
    console.error('subscribe failed', err)
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : 'Subscribe failed',
    })
  }
}
