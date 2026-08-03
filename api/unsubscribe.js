/**
 * GET /api/unsubscribe?token=…
 * One-click unsubscribe for schedule digests.
 */
import { sendHtml, statusPage } from './_lib/http.js'
import { isRedisConfigured } from './_lib/redis.js'
import { unsubscribeByToken } from './_lib/subscribeStore.js'
import { getTenantBySlug } from './_lib/tenants.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET')
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
