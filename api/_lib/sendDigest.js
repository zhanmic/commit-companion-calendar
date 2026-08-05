/**
 * Shared digest send helpers used by cron + post-confirm welcome send.
 */
import { digestEmailContent } from './email.js'
import { sendEmail } from './resend.js'
import {
  filterDigest,
  loadScheduleWindow,
} from './schedule/digest.js'
import { listActiveByFrequency, markSent } from './subscribeStore.js'
import { getTenantBySlug } from './tenants.js'

/**
 * Send one digest to an active subscription if not already sent for the range.
 * Pass `force: true` to resend even when already marked sent (Email me now).
 * Returns { sent, skipped?, rangeKey?, empty?, error? }
 */
export async function sendDigestToSubscription(
  subscription,
  { now = new Date(), base, frequency, force = false } = {},
) {
  const freq = frequency || subscription.frequency
  if (freq !== 'daily' && freq !== 'weekly') {
    return { sent: false, skipped: 'bad_frequency' }
  }
  if (subscription.status !== 'active') {
    return { sent: false, skipped: 'not_active' }
  }

  const tenant = getTenantBySlug(subscription.tenantSlug)
  if (!tenant?.superTeamId) {
    return { sent: false, skipped: 'unknown_tenant' }
  }

  const window = await loadScheduleWindow(tenant, {
    frequency: freq,
    now,
    includeMeets: true,
  })
  return deliverOne({
    tenant,
    sub: subscription,
    window,
    frequency: freq,
    base,
    force,
  })
}

/**
 * Send digests for all active subscribers of one tenant + frequency.
 * Loads the Commit schedule window once and fans out.
 */
export async function sendDigestsForTenantFrequency({
  tenant,
  frequency,
  now,
  base,
}) {
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
      const result = await deliverOne({
        tenant,
        sub,
        window,
        frequency,
        base,
        force: false,
      })
      if (result.sent) sent += 1
      else skipped += 1
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

async function deliverOne({ tenant, sub, window, frequency, base, force = false }) {
  const digest = filterDigest(tenant, sub, window, { frequency })
  const freq = digest.frequency || frequency
  const already =
    freq === 'daily'
      ? sub.lastDailySentOn === digest.rangeKey
      : sub.lastWeeklySentOn === digest.rangeKey
  if (already && !force) {
    return { sent: false, skipped: 'already_sent', rangeKey: digest.rangeKey }
  }

  const unsubscribeUrl = `${base}/api/unsubscribe?token=${encodeURIComponent(sub.unsubscribeToken)}`
  const scheduleUrl = `${base}${tenant.path}`
  const content = digestEmailContent({
    digest,
    tenantName: tenant.displayName,
    scheduleUrl,
    unsubscribeUrl,
    frequency: freq,
  })

  await sendEmail({
    to: sub.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    headers: content.headers,
  })

  await markSent(sub, {
    dailyOn: freq === 'daily' ? digest.rangeKey : undefined,
    weeklyOn: freq === 'weekly' ? digest.rangeKey : undefined,
  })

  return {
    sent: true,
    rangeKey: digest.rangeKey,
    empty: digest.empty,
    frequency: freq,
  }
}
