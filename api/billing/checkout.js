/**
 * POST /api/billing/checkout
 *
 * Sales-assisted Stripe Checkout Session for a team subscription.
 * Auth: Authorization: Bearer $BILLING_ADMIN_SECRET
 *
 * Body: {
 *   tenantSlug: string,
 *   customerEmail?: string,
 *   interval?: 'month' | 'year',
 *   successUrl?: string,
 *   cancelUrl?: string
 * }
 *
 * Returns { url, sessionId }.
 */
import { appBaseUrl, readJsonBody, sendJson } from '../_lib/http.js'
import { getTenantBySlug } from '../_lib/tenants.js'
import {
  billingAdminAuthorized,
  getStripe,
  isStripeConfigured,
  stripePriceIdForInterval,
} from '../_lib/stripe.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization',
    )
    res.end()
    return
  }

  if (req.method === 'GET') {
    sendJson(res, 200, {
      configured: isStripeConfigured(),
      adminSecret: Boolean(process.env.BILLING_ADMIN_SECRET),
      webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      note: 'POST with Bearer BILLING_ADMIN_SECRET to create a Checkout Session.',
    })
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, POST, OPTIONS')
    res.end('Method Not Allowed')
    return
  }

  if (!billingAdminAuthorized(req)) {
    sendJson(res, 401, { error: 'Unauthorized' })
    return
  }

  if (!isStripeConfigured()) {
    sendJson(res, 503, {
      error:
        'Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID.',
    })
    return
  }

  const body = readJsonBody(req)
  if (!body) {
    sendJson(res, 400, { error: 'Expected JSON body' })
    return
  }

  const tenantSlug =
    typeof body.tenantSlug === 'string' ? body.tenantSlug.trim() : ''
  if (!tenantSlug) {
    sendJson(res, 400, { error: 'tenantSlug is required' })
    return
  }

  const tenant = getTenantBySlug(tenantSlug)
  if (!tenant) {
    sendJson(res, 400, {
      error: `Unknown tenantSlug "${tenantSlug}". Register the tenant before checkout.`,
    })
    return
  }

  if (!tenant.superTeamId) {
    sendJson(res, 400, {
      error: 'Tenant is missing Commit superTeamId (prerequisite).',
    })
    return
  }

  const interval = body.interval === 'year' ? 'year' : 'month'
  const priceId = stripePriceIdForInterval(interval)
  if (!priceId) {
    sendJson(res, 503, { error: 'No Stripe price configured for interval' })
    return
  }

  const base = appBaseUrl(req)
  const successUrl =
    typeof body.successUrl === 'string' && body.successUrl
      ? body.successUrl
      : `${base}/service?checkout=success`
  const cancelUrl =
    typeof body.cancelUrl === 'string' && body.cancelUrl
      ? body.cancelUrl
      : `${base}/service?checkout=cancel`

  const customerEmail =
    typeof body.customerEmail === 'string' && body.customerEmail.includes('@')
      ? body.customerEmail.trim()
      : undefined

  try {
    const stripe = getStripe()
    const requireTos = process.env.STRIPE_CHECKOUT_REQUIRE_TOS === '1'
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: customerEmail,
      client_reference_id: tenant.slug,
      metadata: {
        tenantSlug: tenant.slug,
        displayName: tenant.displayName,
      },
      subscription_data: {
        metadata: {
          tenantSlug: tenant.slug,
          displayName: tenant.displayName,
        },
      },
      custom_text: {
        submit: {
          message: `You are subscribing ${tenant.displayName} to My Swim Day. Commit Swimming is required. See Terms (myswimday.com/terms) and Service description (myswimday.com/service).`,
        },
      },
      ...(requireTos
        ? {
            consent_collection: {
              terms_of_service: 'required',
            },
          }
        : {}),
    })

    sendJson(res, 200, {
      url: session.url,
      sessionId: session.id,
      tenantSlug: tenant.slug,
    })
  } catch (err) {
    console.error('billing/checkout failed', err)
    sendJson(res, 502, {
      error: err?.message || 'Stripe Checkout Session failed',
    })
  }
}
