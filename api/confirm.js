/**
 * GET /api/confirm?token=…
 * Confirms a pending email subscription (double opt-in).
 */
import { sendHtml, statusPage } from './_lib/http.js'
import { isRedisConfigured } from './_lib/redis.js'
import { confirmSubscription } from './_lib/subscribeStore.js'
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
        message: 'This confirmation link is missing a token.',
      }),
    )
    return
  }

  try {
    const result = await confirmSubscription(token)
    if (!result.ok) {
      sendHtml(
        res,
        400,
        statusPage({
          title: 'Link expired · My Swim Day',
          heading: 'Link expired',
          message:
            'This confirmation link is invalid or has expired. Subscribe again from the team schedule page.',
        }),
      )
      return
    }

    const tenant = getTenantBySlug(result.subscription.tenantSlug)
    const path = tenant?.path || '/'
    sendHtml(
      res,
      200,
      statusPage({
        title: 'Confirmed · My Swim Day',
        heading: result.already ? 'Already confirmed' : 'Subscription confirmed',
        message: result.already
          ? 'This email is already subscribed to schedule updates.'
          : `You will receive ${result.subscription.frequency} schedule emails for ${tenant?.displayName || 'your team'}.`,
        linkHref: path,
        linkLabel: 'Open schedule',
      }),
    )
  } catch (err) {
    console.error('confirm failed', err)
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
