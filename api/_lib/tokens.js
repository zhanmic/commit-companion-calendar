import { randomBytes } from 'node:crypto'

/** URL-safe random token for confirm / unsubscribe links. */
export function createToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url')
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(email) {
  if (typeof email !== 'string') return null
  const trimmed = email.trim().toLowerCase()
  if (!EMAIL_RE.test(trimmed) || trimmed.length > 254) return null
  return trimmed
}
