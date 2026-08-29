/**
 * Shared Stripe helpers for sales-assisted Checkout + Customer Portal.
 *
 * Entitlement gating (billingStatus on tenants / digest soft-gate) is deferred —
 * see docs/billing-runbook.md. Webhooks are recorded to logs for now.
 */
import Stripe from 'stripe'
import { timingSafeEqual } from 'node:crypto'

let stripeClient = null

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID)
}

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set')
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY)
  }
  return stripeClient
}

export function stripePriceId() {
  return process.env.STRIPE_PRICE_ID || ''
}

/** Optional annual price; monthly STRIPE_PRICE_ID is the default. */
export function stripePriceIdForInterval(interval) {
  if (interval === 'year' && process.env.STRIPE_PRICE_ID_ANNUAL) {
    return process.env.STRIPE_PRICE_ID_ANNUAL
  }
  return stripePriceId()
}

export function billingAdminAuthorized(req) {
  const expected = process.env.BILLING_ADMIN_SECRET
  if (!expected) return false
  const header = req.headers?.authorization || req.headers?.Authorization || ''
  const bearer =
    typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice(7).trim()
      : ''
  const query =
    typeof req.url === 'string'
      ? (() => {
          try {
            return (
              new URL(req.url, 'https://myswimday.com').searchParams.get(
                'secret',
              ) || ''
            )
          } catch {
            return ''
          }
        })()
      : ''
  return secretsEqual(bearer, expected) || secretsEqual(query, expected)
}

function secretsEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function getHeader(req, name) {
  if (!req?.headers) return undefined
  if (typeof req.headers.get === 'function') {
    return req.headers.get(name) || undefined
  }
  const value = req.headers[name] ?? req.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

export async function readRawBody(req) {
  if (typeof req.text === 'function') {
    return req.text()
  }
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body && typeof req.body === 'object') {
    return JSON.stringify(req.body)
  }
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  if (chunks.length) return Buffer.concat(chunks).toString('utf8')
  return ''
}
