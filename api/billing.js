/**
 * Single Hobby-plan billing function.
 *
 * Routes (via vercel.json rewrite or ?op=):
 *   GET/POST /api/billing/checkout      → op=checkout
 *   POST     /api/billing/portal        → op=portal
 *   POST     /api/billing/team-session  → op=team-session
 *   GET/POST /api/billing/webhook       → op=webhook
 *
 * Auth: ops secret, or X-Team-Admin for tenant-scoped ops.
 */
import { appBaseUrl, queryParam, readJsonBody, sendJson } from './_lib/http.js'
import { getTenantBySlug } from './_lib/tenants.js'
import {
  billingAdminAuthorized,
  billingAuthorizedForTenant,
  getHeader,
  getStripe,
  hasTeamAdminPassword,
  isStripeConfigured,
  readRawBody,
  stripePriceIdForInterval,
  verifyTeamAdminToken,
} from './_lib/stripe.js'

const WEBHOOK_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
])

function resolveOp(req) {
  const fromQuery = queryParam(req, 'op')
  if (fromQuery) return fromQuery.trim().toLowerCase()

  const raw = typeof req.url === 'string' ? req.url : ''
  try {
    const path = raw.includes('://')
      ? new URL(raw).pathname
      : new URL(raw, 'https://myswimday.com').pathname
    const parts = path.split('/').filter(Boolean)
    // /api/billing/<op> or /api/billing
    if (parts[0] === 'api' && parts[1] === 'billing' && parts[2]) {
      return parts[2].toLowerCase()
    }
  } catch {
    /* fall through */
  }
  return ''
}

export default async function handler(req, res) {
  const op = resolveOp(req)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Billing-Admin, X-Team-Admin, Stripe-Signature',
    )
    res.end()
    return
  }

  if (!op) {
    if (req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        configured: isStripeConfigured(),
        ops: ['checkout', 'portal', 'team-session', 'webhook'],
        note: 'Use /api/billing/<op> or /api/billing?op=<op>',
      })
      return
    }
    sendJson(res, 400, {
      error: 'Missing billing op. Use /api/billing/checkout|portal|team-session|webhook',
    })
    return
  }

  if (op === 'checkout') return handleCheckout(req, res)
  if (op === 'portal') return handlePortal(req, res)
  if (op === 'team-session') return handleTeamSession(req, res)
  if (op === 'webhook') return handleWebhook(req, res)

  sendJson(res, 404, { error: `Unknown billing op "${op}"` })
}

async function handleCheckout(req, res) {
  if (req.method === 'GET') {
    sendJson(res, 200, {
      configured: isStripeConfigured(),
      adminSecret: Boolean(
        process.env.BILLING_ADMIN_SECRET || process.env.BILLING_UI_SECRET,
      ),
      webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      note: 'POST with ops secret or X-Team-Admin (TEAM_ADMIN_TOKENS).',
    })
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, POST, OPTIONS')
    res.end('Method Not Allowed')
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

  if (
    !billingAuthorizedForTenant(
      req,
      tenantSlug,
      typeof body.teamAdminToken === 'string' ? body.teamAdminToken : '',
    )
  ) {
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

async function handlePortal(req, res) {
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

async function handleTeamSession(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'POST, OPTIONS')
    res.end('Method Not Allowed')
    return
  }

  const body = readJsonBody(req)
  const tenantSlug =
    typeof body?.tenantSlug === 'string' ? body.tenantSlug.trim() : ''
  const token = typeof body?.token === 'string' ? body.token.trim() : ''

  if (!tenantSlug || !token) {
    sendJson(res, 400, { error: 'tenantSlug and token are required' })
    return
  }

  const tenant = getTenantBySlug(tenantSlug)
  if (!tenant) {
    sendJson(res, 400, { error: 'Unknown team' })
    return
  }

  if (!hasTeamAdminPassword(tenantSlug)) {
    sendJson(res, 403, {
      error: 'Team admin access is not configured for this team yet.',
    })
    return
  }

  if (!verifyTeamAdminToken(tenantSlug, token)) {
    sendJson(res, 401, { error: 'Invalid team admin link.' })
    return
  }

  sendJson(res, 200, {
    ok: true,
    tenantSlug: tenant.slug,
    displayName: tenant.displayName,
  })
}

async function handleWebhook(req, res) {
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

  if (WEBHOOK_EVENTS.has(event.type)) {
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
