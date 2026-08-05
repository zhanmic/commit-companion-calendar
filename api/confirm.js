/**
 * GET /api/confirm?token=…
 * Confirms a pending email subscription (double opt-in).
 * On first confirm, immediately sends today’s digest (daily) so subscribers
 * don’t wait until the next cron tick.
 */
import {
  appBaseUrl,
  queryParam,
  sendHtml,
  statusPage,
} from './_lib/http.js'
import { isRedisConfigured } from './_lib/redis.js'
import { isResendConfigured } from './_lib/resend.js'
import { sendDigestToSubscription } from './_lib/sendDigest.js'
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

  const token = queryParam(req, 'token')
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
    let welcomeSent = false

    // First-time confirm: send today's digest now (best-effort).
    if (
      !result.already &&
      result.subscription.frequency === 'daily' &&
      isResendConfigured()
    ) {
      try {
        const sendResult = await sendDigestToSubscription(result.subscription, {
          base: appBaseUrl(req),
          frequency: 'daily',
        })
        welcomeSent = Boolean(sendResult.sent)
      } catch (err) {
        console.error('welcome digest failed', result.subscription.email, err)
      }
    }

    const frequency = result.subscription.frequency
    const teamName = tenant?.displayName || 'your team'
    let message
    if (result.already) {
      message = 'This email is already subscribed to schedule updates.'
    } else if (welcomeSent) {
      message = `You’re confirmed. Today’s ${frequency} schedule email for ${teamName} is on its way — future digests arrive automatically.`
    } else {
      message = `You will receive ${frequency} schedule emails for ${teamName}.`
    }

    sendHtml(
      res,
      200,
      statusPage({
        title: 'Confirmed · My Swim Day',
        heading: result.already ? 'Already confirmed' : 'Subscription confirmed',
        message,
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
