import { PRODUCT_STORAGE_PREFIX } from '../product'

const BILLING_KEY_STORAGE = `${PRODUCT_STORAGE_PREFIX}:billingKey`

/** Billing UI secret stored after admin enters BILLING_UI_SECRET once. */
export function getStoredBillingKey(): string {
  if (typeof window === 'undefined') return ''
  try {
    return localStorage.getItem(BILLING_KEY_STORAGE)?.trim() || ''
  } catch {
    return ''
  }
}

export function setStoredBillingKey(value: string): void {
  if (typeof window === 'undefined') return
  try {
    const trimmed = value.trim()
    if (trimmed) localStorage.setItem(BILLING_KEY_STORAGE, trimmed)
    else localStorage.removeItem(BILLING_KEY_STORAGE)
  } catch {
    // ignore
  }
}

export function clearStoredBillingKey(): void {
  setStoredBillingKey('')
}
