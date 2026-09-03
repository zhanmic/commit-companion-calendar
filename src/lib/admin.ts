import { PRODUCT_STORAGE_PREFIX } from '../product'

export const OPERATOR_ADMIN_EVENT = 'msd:operator-admin'

const ADMIN_STORAGE_KEY = `${PRODUCT_STORAGE_PREFIX}:operatorAdmin`

/**
 * Operator admin — for you (My Swim Day) only.
 * Unlocks advanced schedule settings (Commit-related toggles).
 *
 * Unlock with `?admin=<OPERATOR_ADMIN_PASSWORD>` (verified server-side).
 * Disable with `?admin=0`. Legacy `?admin=1` no longer grants access.
 *
 * Does **not** unlock team Billing — see teamAdmin.ts.
 */

export function getOperatorAdminPassword(): string {
  if (typeof window === 'undefined') return ''
  try {
    return localStorage.getItem(ADMIN_STORAGE_KEY)?.trim() || ''
  } catch {
    return ''
  }
}

export function setOperatorAdminPassword(password: string): void {
  if (typeof window === 'undefined') return
  try {
    const trimmed = password.trim()
    if (trimmed) localStorage.setItem(ADMIN_STORAGE_KEY, trimmed)
    else localStorage.removeItem(ADMIN_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function clearOperatorAdminSession(): void {
  setOperatorAdminPassword('')
  // Drop legacy ?admin=1 flag if present
  try {
    localStorage.removeItem(`${PRODUCT_STORAGE_PREFIX}:admin`)
  } catch {
    // ignore
  }
  notifyOperatorAdminChanged(false)
}

export function hasOperatorAdminSession(): boolean {
  return Boolean(getOperatorAdminPassword())
}

/** Sync check used by settings / schedule locks. */
export function isScheduleAdmin(): boolean {
  return hasOperatorAdminSession()
}

export function notifyOperatorAdminChanged(active: boolean): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(OPERATOR_ADMIN_EVENT, {
      detail: { active },
    }),
  )
}

function stripAdminParam(): void {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('admin')) return
    url.searchParams.delete('admin')
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState({}, '', next)
  } catch {
    // ignore
  }
}

/**
 * Process `?admin=` on the current URL.
 * Password values are verified via POST /api/billing/operator-session.
 */
export async function syncOperatorAdminFromUrl(): Promise<{
  active: boolean
  error: string | null
}> {
  if (typeof window === 'undefined') {
    return { active: false, error: null }
  }

  try {
    const params = new URLSearchParams(window.location.search)
    const flag = params.get('admin')

    if (flag === '0' || flag === 'false') {
      clearOperatorAdminSession()
      stripAdminParam()
      return { active: false, error: null }
    }

    // Legacy ?admin=1 / true — no longer grants access without password.
    if (flag === '1' || flag === 'true') {
      stripAdminParam()
      return {
        active: hasOperatorAdminSession(),
        error: hasOperatorAdminSession()
          ? null
          : 'Operator admin requires a password. Use ?admin=<password>.',
      }
    }

    if (flag && flag.trim()) {
      const password = flag.trim()
      const res = await fetch('/api/billing/operator-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        ok?: boolean
      }
      stripAdminParam()
      if (!res.ok || !data.ok) {
        clearOperatorAdminSession()
        return {
          active: false,
          error: data.error || 'Invalid operator password.',
        }
      }
      setOperatorAdminPassword(password)
      notifyOperatorAdminChanged(true)
      return { active: true, error: null }
    }

    return { active: hasOperatorAdminSession(), error: null }
  } catch {
    return { active: hasOperatorAdminSession(), error: null }
  }
}
