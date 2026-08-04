/**
 * Minimal Upstash Redis REST client (no SDK).
 * Requires UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
 */

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    throw new Error(
      'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN',
    )
  }
  return { url: url.replace(/\/$/, ''), token }
}

/** Run one Redis command via Upstash REST. */
export async function redisCommand(command, ...args) {
  const { url, token } = redisConfig()
  const path = [command, ...args.map(String)]
    .map(encodeURIComponent)
    .join('/')
  const res = await fetch(`${url}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Redis ${command} failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  return data.result
}

/** Run a pipeline of Redis commands. Each entry is [command, ...args]. */
export async function redisPipeline(commands) {
  const { url, token } = redisConfig()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Redis pipeline failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  return data.map((row) => row.result)
}

export function isRedisConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  )
}
