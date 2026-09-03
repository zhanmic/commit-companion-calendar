import { PRODUCT_STORAGE_PREFIX } from '../product'

export const TEAM_ADMIN_EVENT = 'msd:team-admin'

function storageKey(tenantSlug: string) {
  return `${PRODUCT_STORAGE_PREFIX}:teamAdmin:${tenantSlug.toLowerCase()}`
}

/** Stored team-admin token for a tenant (from ?ta= or Settings password). */
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
  notifyTeamAdminChanged(tenantSlug, false)
}

/**
 * Team admin — swim club contact who manages payment for that tenant.
 * Unlock with Settings → Team (password), or `?ta=<token>` on the URL.
 * Billing UI lives in Settings → Team after unlock.
 * Disable with Sign out or `?ta=0`.
 *
 * Separate from operator admin (schedule setup).
 */
export function hasTeamAdminSession(tenantSlug: string): boolean {
  return Boolean(getTeamAdminToken(tenantSlug))
}

export function notifyTeamAdminChanged(
  tenantSlug: string,
  active: boolean,
  options?: { openBilling?: boolean },
): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(TEAM_ADMIN_EVENT, {
      detail: {
        tenantSlug,
        active,
        openBilling: Boolean(options?.openBilling),
      },
    }),
  )
}

/** Verify password (teamAdminToken) and start a team-admin session. */
export async function unlockTeamAdminWithPassword(
  tenantSlug: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = password.trim()
  if (!token) {
    return { ok: false, error: 'Enter the team password.' }
  }

  try {
    const res = await fetch('/api/billing/team-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantSlug, token }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      error?: string
      ok?: boolean
    }
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || 'Incorrect team password.',
      }
    }
    setTeamAdminToken(tenantSlug, token)
    notifyTeamAdminChanged(tenantSlug, true, { openBilling: true })
    return { ok: true }
  } catch {
    return { ok: false, error: 'Network error — try again.' }
  }
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
        notifyTeamAdminChanged(tenantSlug, false)
        return {
          active: false,
          error: data.error || 'Invalid team admin link.',
        }
      }
      setTeamAdminToken(tenantSlug, token)
      notifyTeamAdminChanged(tenantSlug, true, { openBilling: true })
      return { active: true, error: null }
    }

    return { active: hasTeamAdminSession(tenantSlug), error: null }
  } catch {
    return { active: hasTeamAdminSession(tenantSlug), error: null }
  }
}
