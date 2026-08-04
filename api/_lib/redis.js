/**
 * Minimal Upstash Redis REST client (no SDK).
 * Requires UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
 *
 * Docs: https://upstash.com/docs/redis/features/restapi
 * - Single command: POST /  body ["CMD", ...args]
 * - Pipeline:       POST /pipeline  body [["CMD", ...], ...]
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

async function redisPost(path, body) {
  const { url, token } = redisConfig()
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Redis request failed (${res.status}): ${text}`)
  }
  return res.json()
}

/** Run one Redis command via Upstash REST. */
export async function redisCommand(command, ...args) {
  const data = await redisPost('/', [command, ...args.map(String)])
  return data.result
}

/** Run a pipeline of Redis commands. Each entry is [command, ...args]. */
export async function redisPipeline(commands) {
  const payload = commands.map((cmd) => cmd.map(String))
  const data = await redisPost('/pipeline', payload)
  if (!Array.isArray(data)) {
    throw new Error('Redis pipeline returned unexpected response')
  }
  return data.map((row) => row.result)
}

export function isRedisConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  )
}
