/**
 * Shared Commit dump cache for public schedule + ICS feeds.
 * Same key as /api/schedule so Siri and Calendar share one fetch.
 */
import { isRedisConfigured, redisCommand } from '../redis.js'
import { fetchCommitBundle } from './publicQuery.js'

const CACHE_TTL_SEC = 120

export async function loadCommitBundleCached(tenant) {
  const cacheKey = `msd:pubcache:v2:${tenant.slug}`
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
  if (isRedisConfigured()) {
    try {
      await redisCommand(
        'SET',
        cacheKey,
        JSON.stringify({
          timeZone: bundle.timeZone,
          schedule: bundle.schedule,
        }),
        'EX',
        String(CACHE_TTL_SEC),
      )
    } catch {
      // cache is optional
    }
  }
  return bundle
}
