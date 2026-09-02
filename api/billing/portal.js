/**
 * POST /api/billing/portal
 *
 * Create a Stripe Customer Portal session so a team admin can update card
 * or cancel.
 *
 * Auth: ops secret (Bearer / X-Billing-Admin) or X-Team-Admin for that tenant.
 *
 * Body: { customerId?: string, tenantSlug?: string, returnUrl?: string }
 * Provide customerId or a tenantSlug that has stripeCustomerId configured.
 */
import { appBaseUrl, readJsonBody, sendJson } from '../_lib/http.js'
import { getTenantBySlug } from '../_lib/tenants.js'
import {
  billingAdminAuthorized,
  billingAuthorizedForTenant,
  getStripe,
  isStripeConfigured,
} from '../_lib/stripe.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Billing-Admin, X-Team-Admin',
    )
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'POST, OPTIONS')
    res.end('Method Not Allowed')
    return
  }

  const body = readJsonBody(req)
  const tenantSlug =
    typeof body?.tenantSlug === 'string' ? body.tenantSlug.trim() : ''

  let customerId =
    typeof body?.customerId === 'string' ? body.customerId.trim() : ''

  if (!customerId && tenantSlug) {
    const tenant = getTenantBySlug(tenantSlug)
    if (!tenant) {
      sendJson(res, 400, { error: 'Unknown tenantSlug' })
      return
    }
    customerId =
      typeof tenant.stripeCustomerId === 'string'
        ? tenant.stripeCustomerId.trim()
        : ''
    if (!customerId) {
      sendJson(res, 400, {
        error:
          'This team has no stripeCustomerId yet. After Checkout, the operator sets it on the tenant config.',
      })
      return
    }
  }

  if (!customerId) {
    sendJson(res, 400, { error: 'customerId or tenantSlug is required' })
    return
  }

  if (tenantSlug) {
    if (
      !billingAuthorizedForTenant(
        req,
        tenantSlug,
        typeof body?.teamAdminToken === 'string' ? body.teamAdminToken : '',
      )
    ) {
      sendJson(res, 401, { error: 'Unauthorized' })
      return
    }
  } else if (!billingAdminAuthorized(req)) {
    sendJson(res, 401, { error: 'Unauthorized' })
    return
  }

  if (!isStripeConfigured()) {
    sendJson(res, 503, { error: 'Stripe is not configured.' })
    return
  }

  const base = appBaseUrl(req)
  const returnUrl =
    typeof body?.returnUrl === 'string' && body.returnUrl
      ? body.returnUrl
      : `${base}/`

  try {
    const stripe = getStripe()
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    })
    sendJson(res, 200, { url: session.url })
  } catch (err) {
    console.error('billing/portal failed', err)
    sendJson(res, 502, {
      error: err?.message || 'Stripe Customer Portal session failed',
    })
  }
}
