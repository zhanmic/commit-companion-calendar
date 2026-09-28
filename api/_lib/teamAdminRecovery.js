/**
 * Team-admin recovery email + forgot-password helpers.
 *
 * Recovery address resolution (first match wins):
 *   1. TEAM_ADMIN_EMAIL_<SLUG> env (e.g. TEAM_ADMIN_EMAIL_VORTEXSWIMCLUB)
 *   2. TEAM_ADMIN_EMAILS JSON map {"VortexSwimClub":"…"}
 *   3. tenant.teamAdminEmail in api/_lib/tenants.js
 *
 * Passwords still live in TEAM_ADMIN_TOKENS — this only emails an unlock link.
 */
import { isRedisConfigured, redisCommand } from './redis.js'
import { getTenantBySlug } from './tenants.js'
import { getTeamAdminPassword } from './teamAdminSecrets.js'

const FORGOT_WINDOW_SEC = 60 * 60
const FORGOT_MAX_PER_WINDOW = 3

function envKeyForSlug(slug) {
  return `TEAM_ADMIN_EMAIL_${String(slug)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')}`
}

function parseEmailsJson() {
  const raw = process.env.TEAM_ADMIN_EMAILS
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed
  } catch (err) {
    console.warn('TEAM_ADMIN_EMAILS is not valid JSON', err?.message || err)
    return null
  }
}

function looksLikeEmail(value) {
  return typeof value === 'string' && value.trim().includes('@')
}

/**
 * Resolve the recovery inbox for a tenant (coach / ops contact).
 * Returns '' when none configured.
 */
export function getTeamAdminEmail(tenantSlug) {
  if (!tenantSlug || typeof tenantSlug !== 'string') return ''
  const tenant = getTenantBySlug(tenantSlug.trim())
  const canonical = tenant?.slug || tenantSlug.trim()

  const perSlug = process.env[envKeyForSlug(canonical)]
  if (looksLikeEmail(perSlug)) return perSlug.trim()

  const rawKey = process.env[envKeyForSlug(tenantSlug.trim())]
  if (looksLikeEmail(rawKey)) return rawKey.trim()

  const map = parseEmailsJson()
  if (map) {
    const fromCanonical = map[canonical]
    if (looksLikeEmail(fromCanonical)) return fromCanonical.trim()

    const fromRaw = map[tenantSlug.trim()]
    if (looksLikeEmail(fromRaw)) return fromRaw.trim()

    const lower = canonical.toLowerCase()
    for (const [key, value] of Object.entries(map)) {
      if (
        typeof key === 'string' &&
        key.toLowerCase() === lower &&
        looksLikeEmail(value)
      ) {
        return value.trim()
      }
    }
  }

  if (looksLikeEmail(tenant?.teamAdminEmail)) {
    return String(tenant.teamAdminEmail).trim()
  }

  return ''
}

export function hasTeamAdminEmail(tenantSlug) {
  return Boolean(getTeamAdminEmail(tenantSlug))
}

/** Mask for UI: z***@gmail.com */
export function maskEmail(email) {
  if (!looksLikeEmail(email)) return '***'
  const trimmed = email.trim()
  const at = trimmed.indexOf('@')
  const user = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  const visible = user.slice(0, 1) || '*'
  return `${visible}***@${domain}`
}

/**
 * Soft rate limit: max FORGOT_MAX_PER_WINDOW emails per tenant per hour.
 * Without Redis, allow the request (still gated by Resend + recovery email).
 */
export async function consumeForgotPasswordQuota(tenantSlug) {
  const slug = String(tenantSlug || '')
    .trim()
    .toLowerCase()
  if (!slug) {
    return { allowed: false, error: 'Unknown team' }
  }

  if (!isRedisConfigured()) {
    return { allowed: true, limited: false }
  }

  try {
    const key = `teamAdmin:forgot:${slug}`
    const count = Number(await redisCommand('INCR', key))
    if (count === 1) {
      await redisCommand('EXPIRE', key, FORGOT_WINDOW_SEC)
    }
    if (count > FORGOT_MAX_PER_WINDOW) {
      return {
        allowed: false,
        limited: true,
        error: 'Too many reset requests. Try again in about an hour.',
      }
    }
    return { allowed: true, limited: false, count }
  } catch (err) {
    console.warn(
      'forgot-password rate limit failed; allowing request',
      err?.message || err,
    )
    return { allowed: true, limited: false }
  }
}

/**
 * Build unlock URL for the tenant password (same secret as Settings → Team).
 * Returns null when password is not configured.
 */
export function buildTeamAdminUnlockUrl(tenant, baseUrl) {
  const password = getTeamAdminPassword(tenant.slug)
  if (!password) return null
  const path = tenant.path || `/${tenant.shortSlug || tenant.slug}`
  const base = String(baseUrl || '').replace(/\/$/, '')
  const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`)
  url.searchParams.set('ta', password)
  return url.toString()
}
