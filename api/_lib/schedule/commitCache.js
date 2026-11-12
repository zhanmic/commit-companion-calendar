/**
 * Shared Commit dump cache for public schedule + ICS feeds.
 * Same key as /api/schedule so Siri and Calendar share one fetch.
 *
 * Only the fields expand/parse read are stored. Programs, record boards,
 * coaches, and meet registration metadata stay out of Redis.
 */
import { isRedisConfigured, redisCommand } from '../redis.js'
import { fetchCommitBundle } from './publicQuery.js'

const CACHE_TTL_SEC = 300

const EVENT_FIELDS = ['_id', 'label', 'name', 'description', 'startDate', 'endDate']
const RECURRING_FIELDS = ['endDate', 'days', 'period']
const CUSTOM_FIELDS = ['id', 'removed', 'startTime', 'endTime', 'name']
const MEET_FIELDS = [
  '_id',
  'startDateTime',
  'endDateTime',
  'userTitle',
  'titleEventsFile',
  'locationDetails',
  'city',
  'state',
]

function pick(source, fields) {
  if (!source || typeof source !== 'object') return {}
  const out = {}
  for (const field of fields) {
    if (source[field] !== undefined && source[field] !== null) {
      out[field] = source[field]
    }
  }
  return out
}

function slimEvent(event) {
  const slim = pick(event, EVENT_FIELDS)
  if (event?.recurring && typeof event.recurring === 'object') {
    const recurring = pick(event.recurring, RECURRING_FIELDS)
    if (Array.isArray(event.recurring.custom)) {
      recurring.custom = event.recurring.custom.map((entry) =>
        pick(entry, CUSTOM_FIELDS),
      )
    }
    slim.recurring = recurring
  }
  return slim
}

function slimMeet(meet) {
  return pick(meet, MEET_FIELDS)
}

/** Drop Commit fields the public schedule never expands. */
export function slimSchedule(schedule) {
  return {
    events: (schedule?.events ?? []).map(slimEvent),
    meets: (schedule?.meets ?? []).map(slimMeet),
  }
}

export async function loadCommitBundleCached(tenant) {
  const cacheKey = `msd:pubcache:v3:${tenant.slug}`
  if (isRedisConfigured()) {
    try {
      const raw = await redisCommand('GET', cacheKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.schedule && parsed?.timeZone) return parsed
      }
    } catch {
      // continue to live fetch
    }
  }

  const bundle = await fetchCommitBundle(tenant, true)
  const cached = {
    timeZone: bundle.timeZone,
    schedule: slimSchedule(bundle.schedule),
  }
  if (isRedisConfigured()) {
    try {
      await redisCommand(
        'SET',
        cacheKey,
        JSON.stringify(cached),
        'EX',
        String(CACHE_TTL_SEC),
      )
    } catch {
      // cache is optional
    }
  }
  return cached
}
