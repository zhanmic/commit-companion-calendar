/**
 * POST /api/billing/webhook
 *
 * Stripe webhook stub. Verifies signatures when STRIPE_WEBHOOK_SECRET is set
 * and raw body is available. Logs subscription lifecycle events.
 *
 * Entitlement persistence (billingStatus on tenants, digest soft-gate) is
 * intentionally deferred — record events in Stripe Dashboard + ops notes until
 * true-tenant storage exists. See docs/billing-runbook.md.
 *
 * Configure Stripe webhook URL:
 *   https://myswimday.com/api/billing/webhook
 * Events: checkout.session.completed, customer.subscription.*, invoice.paid,
 *         invoice.payment_failed
 */
import { sendJson } from '../_lib/http.js'
import {
  getHeader,
  getStripe,
  readRawBody,
} from '../_lib/stripe.js'

const HANDLED = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
])

export default async function handler(req, res) {
  if (req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      stripeKey: Boolean(process.env.STRIPE_SECRET_KEY),
      note: 'Stripe billing webhook endpoint. Entitlement gating deferred.',
    })
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, POST')
    res.end('Method Not Allowed')
    return
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    sendJson(res, 503, { error: 'STRIPE_WEBHOOK_SECRET is not set' })
    return
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    sendJson(res, 503, { error: 'STRIPE_SECRET_KEY is not set' })
    return
  }

  let event
  try {
    const rawBody = await readRawBody(req)
    const signature = getHeader(req, 'stripe-signature')
    const stripe = getStripe()

    if (typeof rawBody === 'string' && signature) {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    } else if (rawBody && typeof rawBody === 'object' && rawBody.type) {
      // Fallback when the runtime already parsed JSON (signature may be invalid).
      console.warn(
        'billing/webhook: using parsed body without signature verify — prefer raw body on Vercel',
      )
      event = rawBody
    } else {
      sendJson(res, 400, { error: 'Missing body or Stripe-Signature' })
      return
    }
  } catch (err) {
    console.error('billing/webhook verify failed', err)
    sendJson(res, 400, {
      error: err?.message || 'Webhook signature verification failed',
    })
    return
  }

  if (HANDLED.has(event.type)) {
    const obj = event.data?.object || {}
    const tenantSlug =
      obj.metadata?.tenantSlug ||
      obj.client_reference_id ||
      obj.subscription_details?.metadata?.tenantSlug ||
      null
    console.log(
      JSON.stringify({
        source: 'stripe-webhook',
        type: event.type,
        id: event.id,
        tenantSlug,
        customer: obj.customer || null,
        subscription: obj.subscription || obj.id || null,
        status: obj.status || null,
        // Deferred: persist billingStatus / soft-gate digests here later.
        entitlementApplied: false,
      }),
    )
  } else {
    console.log(
      JSON.stringify({
        source: 'stripe-webhook',
        type: event.type,
        id: event.id,
        ignored: true,
      }),
    )
  }

  sendJson(res, 200, { received: true })
}
