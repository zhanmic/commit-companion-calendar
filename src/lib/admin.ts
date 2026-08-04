import { PRODUCT_STORAGE_PREFIX } from '../product'

const ADMIN_STORAGE_KEY = `${PRODUCT_STORAGE_PREFIX}:admin`

/**
 * Lightweight admin unlock for advanced schedule settings.
 * Enable with `?admin=1` on any tenant URL (stored for this browser).
 * Disable with `?admin=0`.
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
