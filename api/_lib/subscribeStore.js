import { redisCommand, redisPipeline } from './redis.js'
import { createToken } from './tokens.js'

function subKey(tenantSlug, email) {
  return `msd:sub:${tenantSlug}:${email}`
}

function confirmKey(token) {
  return `msd:confirm:${token}`
}

function unsubKey(token) {
  return `msd:unsub:${token}`
}

function indexKey(frequency, tenantSlug) {
  return `msd:idx:${frequency}:${tenantSlug}`
}

function parseSub(raw) {
  if (!raw) return null
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return null
  }
}

export async function getSubscription(tenantSlug, email) {
  return parseSub(await redisCommand('GET', subKey(tenantSlug, email)))
}

export async function getSubscriptionByConfirmToken(token) {
  const pointer = await redisCommand('GET', confirmKey(token))
  if (!pointer || typeof pointer !== 'string') return null
  const [tenantSlug, email] = pointer.split('\n')
  if (!tenantSlug || !email) return null
  return getSubscription(tenantSlug, email)
}

export async function getSubscriptionByUnsubToken(token) {
  const pointer = await redisCommand('GET', unsubKey(token))
  if (!pointer || typeof pointer !== 'string') return null
  const [tenantSlug, email] = pointer.split('\n')
  if (!tenantSlug || !email) return null
  return getSubscription(tenantSlug, email)
}

/**
 * Create or refresh a pending/active subscription.
 * Returns { subscription, created, confirmToken } where confirmToken is only
 * set when a confirmation email should be sent.
 */
export async function upsertSubscription(input) {
  const {
    email,
    tenantSlug,
    frequency,
    groups,
    includeEvents,
    includeMeets,
    timezone,
  } = input

  const existing = await getSubscription(tenantSlug, email)
  const now = new Date().toISOString()

  if (existing?.status === 'active') {
    const updated = {
      ...existing,
      frequency,
      groups,
      includeEvents,
      includeMeets,
      timezone,
      updatedAt: now,
    }
    await saveSubscription(updated, existing)
    return { subscription: updated, created: false, confirmToken: null }
  }

  const confirmToken = createToken()
  const unsubscribeToken = existing?.unsubscribeToken || createToken()
  const subscription = {
    email,
    tenantSlug,
    frequency,
    groups,
    includeEvents: Boolean(includeEvents),
    includeMeets: Boolean(includeMeets),
    timezone,
    status: 'pending',
    confirmToken,
    unsubscribeToken,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    confirmedAt: null,
    lastDailySentOn: existing?.lastDailySentOn ?? null,
    lastWeeklySentOn: existing?.lastWeeklySentOn ?? null,
  }

  if (existing?.confirmToken) {
    await redisCommand('DEL', confirmKey(existing.confirmToken))
  }

  await saveSubscription(subscription, existing)
  await redisCommand(
    'SET',
    confirmKey(confirmToken),
    `${tenantSlug}\n${email}`,
    'EX',
    String(60 * 60 * 48),
  )
  await redisCommand(
    'SET',
    unsubKey(unsubscribeToken),
    `${tenantSlug}\n${email}`,
  )

  return { subscription, created: !existing, confirmToken }
}

export async function confirmSubscription(token) {
  const subscription = await getSubscriptionByConfirmToken(token)
  if (!subscription) return { ok: false, reason: 'invalid' }
  if (subscription.confirmToken !== token && subscription.status !== 'active') {
    return { ok: false, reason: 'invalid' }
  }
  if (subscription.status === 'active') {
    return { ok: true, subscription, already: true }
  }

  const previous = { ...subscription }
  const now = new Date().toISOString()
  subscription.status = 'active'
  subscription.confirmedAt = now
  subscription.updatedAt = now
  subscription.confirmToken = null
  await saveSubscription(subscription, previous)
  await redisCommand('DEL', confirmKey(token))
  return { ok: true, subscription, already: false }
}

export async function unsubscribeByToken(token) {
  const subscription = await getSubscriptionByUnsubToken(token)
  if (!subscription) return { ok: false, reason: 'invalid' }
  return finalizeUnsubscribe(subscription)
}

/** Unsubscribe (or cancel pending) by email + tenant. */
export async function unsubscribeByEmail(tenantSlug, email) {
  const subscription = await getSubscription(tenantSlug, email)
  if (!subscription) return { ok: false, reason: 'not_found' }
  return finalizeUnsubscribe(subscription)
}

async function finalizeUnsubscribe(subscription) {
  if (subscription.status === 'unsubscribed') {
    return { ok: true, subscription, already: true }
  }

  const previous = { ...subscription }
  if (subscription.confirmToken) {
    await redisCommand('DEL', confirmKey(subscription.confirmToken))
  }
  subscription.status = 'unsubscribed'
  subscription.confirmToken = null
  subscription.updatedAt = new Date().toISOString()
  await saveSubscription(subscription, previous)
  return { ok: true, subscription, already: false }
}

export async function listActiveByFrequency(frequency, tenantSlug) {
  const emails = await redisCommand('SMEMBERS', indexKey(frequency, tenantSlug))
  if (!Array.isArray(emails) || emails.length === 0) return []

  const keys = emails.map((email) => subKey(tenantSlug, email))
  const values = await redisPipeline(keys.map((key) => ['GET', key]))
  return values
    .map(parseSub)
    .filter((sub) => sub && sub.status === 'active' && sub.frequency === frequency)
}

export async function markSent(subscription, { dailyOn, weeklyOn }) {
  const previous = { ...subscription }
  if (dailyOn) subscription.lastDailySentOn = dailyOn
  if (weeklyOn) subscription.lastWeeklySentOn = weeklyOn
  subscription.updatedAt = new Date().toISOString()
  await saveSubscription(subscription, previous)
  return subscription
}

async function saveSubscription(subscription, previous) {
  const key = subKey(subscription.tenantSlug, subscription.email)
  const commands = [['SET', key, JSON.stringify(subscription)]]

  // Maintain frequency indexes for active subs only.
  for (const freq of ['daily', 'weekly']) {
    const idx = indexKey(freq, subscription.tenantSlug)
    if (subscription.status === 'active' && subscription.frequency === freq) {
      commands.push(['SADD', idx, subscription.email])
    } else {
      commands.push(['SREM', idx, subscription.email])
    }
  }

  // If frequency changed while active, ensure old index is cleared.
  if (
    previous &&
    previous.status === 'active' &&
    previous.frequency !== subscription.frequency
  ) {
    commands.push([
      'SREM',
      indexKey(previous.frequency, subscription.tenantSlug),
      subscription.email,
    ])
  }

  await redisPipeline(commands)
}
