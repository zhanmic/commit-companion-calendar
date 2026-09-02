import { PRODUCT_STORAGE_PREFIX } from '../product'

const ADMIN_STORAGE_KEY = `${PRODUCT_STORAGE_PREFIX}:admin`

/**
 * Operator admin — for you (My Swim Day) only.
 * Unlocks advanced schedule settings (Commit-related toggles, parsers UI).
 * Enable with `?admin=1` (stored for this browser). Disable with `?admin=0`.
 *
 * Does **not** unlock team Billing. Team admins use `?ta=<token>` — see teamAdmin.ts.
 */
export function isScheduleAdmin(): boolean {
  if (typeof window === 'undefined') return false

  try {
    const params = new URLSearchParams(window.location.search)
    const flag = params.get('admin')
    if (flag === '1' || flag === 'true') {
      localStorage.setItem(ADMIN_STORAGE_KEY, '1')
      return true
    }
    if (flag === '0' || flag === 'false') {
      localStorage.removeItem(ADMIN_STORAGE_KEY)
      return false
    }
    return localStorage.getItem(ADMIN_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}
