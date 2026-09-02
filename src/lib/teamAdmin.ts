import { PRODUCT_STORAGE_PREFIX } from '../product'

function storageKey(tenantSlug: string) {
  return `${PRODUCT_STORAGE_PREFIX}:teamAdmin:${tenantSlug.toLowerCase()}`
}

/** Stored team-admin token for a tenant (from ?ta= after server verify). */
export function getTeamAdminToken(tenantSlug: string): string {
  if (typeof window === 'undefined') return ''
  try {
    return localStorage.getItem(storageKey(tenantSlug))?.trim() || ''
  } catch {
    return ''
  }
}

export function setTeamAdminToken(tenantSlug: string, token: string): void {
  if (typeof window === 'undefined') return
  try {
    const trimmed = token.trim()
    if (trimmed) localStorage.setItem(storageKey(tenantSlug), trimmed)
    else localStorage.removeItem(storageKey(tenantSlug))
  } catch {
    // ignore
  }
}

export function clearTeamAdminToken(tenantSlug: string): void {
  setTeamAdminToken(tenantSlug, '')
}

/**
 * Team admin — swim club contact who manages payment for that tenant.
 * Unlock with `?ta=<teamAdminToken>` on the tenant URL (verified server-side).
 * Disable with `?ta=0`.
 *
 * Separate from operator `?admin=1` (schedule setup).
 */
export function hasTeamAdminSession(tenantSlug: string): boolean {
  return Boolean(getTeamAdminToken(tenantSlug))
}

function stripTaParam(): void {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('ta')) return
    url.searchParams.delete('ta')
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState({}, '', next)
  } catch {
    // ignore
  }
}

/**
 * Process `?ta=` on the current URL for this tenant.
 * Returns session state after unlock/clear/verify.
 */
export async function syncTeamAdminFromUrl(
  tenantSlug: string,
): Promise<{ active: boolean; error: string | null }> {
  if (typeof window === 'undefined') {
    return { active: false, error: null }
  }

  try {
    const params = new URLSearchParams(window.location.search)
    const flag = params.get('ta')

    if (flag === '0' || flag === 'false') {
      clearTeamAdminToken(tenantSlug)
      stripTaParam()
      return { active: false, error: null }
    }

    if (flag && flag !== '1' && flag !== 'true') {
      const token = flag.trim()
      const res = await fetch('/api/billing/team-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug, token }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        ok?: boolean
      }
      stripTaParam()
      if (!res.ok || !data.ok) {
        clearTeamAdminToken(tenantSlug)
        return {
          active: false,
          error: data.error || 'Invalid team admin link.',
        }
      }
      setTeamAdminToken(tenantSlug, token)
      return { active: true, error: null }
    }

    return { active: hasTeamAdminSession(tenantSlug), error: null }
  } catch {
    return { active: hasTeamAdminSession(tenantSlug), error: null }
  }
}
