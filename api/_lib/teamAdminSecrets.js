/**
 * Team admin passwords / unlock tokens — from environment only (not git).
 *
 * Preferred: TEAM_ADMIN_TOKENS JSON map
 *   TEAM_ADMIN_TOKENS={"DelmarDolfins":"…","VortexSwimClub":"…"}
 *
 * Optional override per slug:
 *   TEAM_ADMIN_TOKEN_DELMARDOLFINS=…
 *   (slug uppercased; non [A-Z0-9] → _)
 *
 * Operator schedule admin (?admin=1) has no password — browser flag only.
 */
import { timingSafeEqual } from 'node:crypto'
import { getTenantBySlug } from './tenants.js'

function envKeyForSlug(slug) {
  return `TEAM_ADMIN_TOKEN_${String(slug)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')}`
}

function parseTokensJson() {
  const raw = process.env.TEAM_ADMIN_TOKENS
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed
  } catch (err) {
    console.warn('TEAM_ADMIN_TOKENS is not valid JSON', err?.message || err)
    return null
  }
}

/**
 * Resolve the expected team password for a tenant slug (or alias).
 * Returns '' if none configured.
 */
export function getTeamAdminPassword(tenantSlug) {
  if (!tenantSlug || typeof tenantSlug !== 'string') return ''
  const tenant = getTenantBySlug(tenantSlug.trim())
  const canonical = tenant?.slug || tenantSlug.trim()

  const perSlug = process.env[envKeyForSlug(canonical)]
  if (typeof perSlug === 'string' && perSlug.trim()) {
    return perSlug.trim()
  }

  // Try alias / raw slug env keys too
  const rawKey = process.env[envKeyForSlug(tenantSlug.trim())]
  if (typeof rawKey === 'string' && rawKey.trim()) {
    return rawKey.trim()
  }

  const map = parseTokensJson()
  if (!map) return ''

  const fromCanonical = map[canonical]
  if (typeof fromCanonical === 'string' && fromCanonical.trim()) {
    return fromCanonical.trim()
  }

  const fromRaw = map[tenantSlug.trim()]
  if (typeof fromRaw === 'string' && fromRaw.trim()) {
    return fromRaw.trim()
  }

  // Case-insensitive key match
  const lower = canonical.toLowerCase()
  for (const [key, value] of Object.entries(map)) {
    if (
      typeof key === 'string' &&
      key.toLowerCase() === lower &&
      typeof value === 'string' &&
      value.trim()
    ) {
      return value.trim()
    }
  }

  return ''
}

export function hasTeamAdminPassword(tenantSlug) {
  return Boolean(getTeamAdminPassword(tenantSlug))
}

export function secretsEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/** True if presented password matches the env secret for this tenant. */
export function verifyTeamAdminPassword(tenantSlug, password) {
  const expected = getTeamAdminPassword(tenantSlug)
  if (!expected || !password) return false
  return secretsEqual(String(password).trim(), expected)
}
