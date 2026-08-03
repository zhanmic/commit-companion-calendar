/**
 * GET  /api/unsubscribe?token=…  — one-click link from emails
 * POST /api/unsubscribe          — { email, tenantSlug } from the week-view UI
 */
import {
  readJsonBody,
  sendHtml,
  sendJson,
  statusPage,
} from './_lib/http.js'
import { isRedisConfigured } from './_lib/redis.js'
import {
  unsubscribeByEmail,
  unsubscribeByToken,
} from './_lib/subscribeStore.js'
import { getTenantBySlug } from './_lib/tenants.js'
import { normalizeEmail } from './_lib/tokens.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.end()
    return
  }

  if (req.method === 'POST') {
    return handlePost(req, res)
  }

  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, POST, OPTIONS')
    res.end('Method Not Allowed')
    return
  }

  if (!isRedisConfigured()) {
    sendHtml(
      res,
      503,
      statusPage({
        title: 'Unavailable · My Swim Day',
        heading: 'Unavailable',
        message: 'Email subscriptions are not configured on this environment.',
      }),
    )
    return
  }

  const token = typeof req.query?.token === 'string' ? req.query.token : ''
  if (!token) {
    sendHtml(
      res,
      400,
      statusPage({
        title: 'Invalid link · My Swim Day',
        heading: 'Invalid link',
        message: 'This unsubscribe link is missing a token.',
      }),
    )
    return
  }

  try {
    const result = await unsubscribeByToken(token)
    if (!result.ok) {
      sendHtml(
        res,
        400,
        statusPage({
          title: 'Invalid link · My Swim Day',
          heading: 'Invalid link',
          message: 'This unsubscribe link is invalid.',
        }),
      )
      return
    }

    const tenant = getTenantBySlug(result.subscription.tenantSlug)
    sendHtml(
      res,
      200,
      statusPage({
        title: 'Unsubscribed · My Swim Day',
        heading: result.already ? 'Already unsubscribed' : 'Unsubscribed',
        message: result.already
          ? 'This email is already unsubscribed.'
          : `You will no longer receive schedule emails for ${tenant?.displayName || 'this team'}.`,
        linkHref: tenant?.path || '/',
        linkLabel: 'Back to schedule',
      }),
    )
  } catch (err) {
    console.error('unsubscribe failed', err)
    sendHtml(
      res,
      500,
      statusPage({
        title: 'Error · My Swim Day',
        heading: 'Something went wrong',
        message: 'Please try the link again in a moment.',
      }),
    )
  }
}

async function handlePost(req, res) {
  if (!isRedisConfigured()) {
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
  if (!tenant) {
    sendJson(res, 400, { error: 'Unknown team' })
    return
  }

  try {
    const result = await unsubscribeByEmail(tenant.slug, email)
    // Do not reveal whether the address was subscribed.
    if (!result.ok) {
      sendJson(res, 200, {
        ok: true,
        status: 'unsubscribed',
        message: `If ${email} was subscribed to ${tenant.displayName}, it is now unsubscribed.`,
      })
      return
    }

    sendJson(res, 200, {
      ok: true,
      status: result.already ? 'already_unsubscribed' : 'unsubscribed',
      message: result.already
        ? 'This email is already unsubscribed.'
        : `Unsubscribed from ${tenant.displayName} schedule emails.`,
    })
  } catch (err) {
    console.error('unsubscribe POST failed', err)
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : 'Unsubscribe failed',
    })
  }
}
