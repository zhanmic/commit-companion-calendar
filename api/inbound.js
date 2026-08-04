/**
 * POST /api/inbound
 *
 * Resend webhook for `email.received`. Forwards inbound mail to
 * CONTACT_FORWARD_TO (Gmail) via Resend's receiving.forward helper.
 *
 * Env: RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_WEBHOOK_SECRET,
 *      CONTACT_FORWARD_TO, optional CONTACT_INBOUND_ADDRESSES,
 *      optional CONTACT_INBOUND_DOMAIN (default mail.myswimday.com)
 */
import { Resend } from 'resend'
import { sendJson } from './_lib/http.js'

const DEFAULT_INBOUND_DOMAIN = 'mail.myswimday.com'
const DEFAULT_INBOUND = `sales@${DEFAULT_INBOUND_DOMAIN}`

/** Next-style hint; ignored on some Vite/Vercel runtimes. */
export const config = {
  api: {
    bodyParser: false,
  },
}

function inboundDomain() {
  return (
    process.env.CONTACT_INBOUND_DOMAIN || DEFAULT_INBOUND_DOMAIN
  ).toLowerCase()
}

function inboundAllowlist() {
  const raw = process.env.CONTACT_INBOUND_ADDRESSES || DEFAULT_INBOUND
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

function normalizeAddress(value) {
  if (!value || typeof value !== 'string') return ''
  const match = value.match(/<([^>]+)>/)
  return (match ? match[1] : value).trim().toLowerCase()
}

function addressesFromEvent(data) {
  const list = [
    ...(Array.isArray(data?.to) ? data.to : []),
    ...(Array.isArray(data?.cc) ? data.cc : []),
    ...(Array.isArray(data?.received_for) ? data.received_for : []),
  ]
  return [...new Set(list.map(normalizeAddress).filter(Boolean))]
}

function isAllowedRecipient(addr) {
  if (!addr) return false
  const allow = inboundAllowlist()
  if (allow.has(addr)) return true
  const domain = inboundDomain()
  return addr.endsWith(`@${domain}`)
}

function isInboundConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY &&
      process.env.RESEND_FROM_EMAIL &&
      process.env.RESEND_WEBHOOK_SECRET &&
      process.env.CONTACT_FORWARD_TO,
  )
}

function headerValue(headers, name) {
  if (!headers) return undefined
  if (typeof headers.get === 'function') {
    return headers.get(name) || headers.get(name.toLowerCase()) || undefined
  }
  const value = headers[name] ?? headers[name.toLowerCase()]
  if (Array.isArray(value)) return value[0]
  return value
}

async function readRawBodyFromNodeReq(req) {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')

  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  if (chunks.length) return Buffer.concat(chunks).toString('utf8')

  if (req.body && typeof req.body === 'object') {
    // Last resort — may break Svix if key order differs from the wire payload.
    return JSON.stringify(req.body)
  }
  return ''
}

async function handleInbound({ payload, headers }) {
  if (!isInboundConfigured()) {
    return {
      status: 503,
      body: { error: 'Inbound email forwarding is not configured' },
    }
  }

  const id = headerValue(headers, 'svix-id')
  const timestamp = headerValue(headers, 'svix-timestamp')
  const signature = headerValue(headers, 'svix-signature')

  if (!id || !timestamp || !signature) {
    return {
      status: 400,
      body: { error: 'Missing webhook signature headers' },
    }
  }

  const resend = new Resend(process.env.RESEND_API_KEY)

  let event
  try {
    event = resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    })
  } catch (err) {
    console.error('inbound webhook verify failed', err)
    return { status: 400, body: { error: 'Invalid webhook signature' } }
  }

  if (event.type !== 'email.received') {
    return { status: 200, body: { ok: true, ignored: event.type } }
  }

  const emailId = event.data?.email_id
  if (!emailId) {
    return { status: 400, body: { error: 'Missing email_id' } }
  }

  const recipients = addressesFromEvent(event.data)
  const matched = recipients.filter(isAllowedRecipient)
  if (!matched.length) {
    console.warn('inbound ignored: recipient_not_allowlisted', recipients)
    return {
      status: 200,
      body: {
        ok: true,
        ignored: 'recipient_not_allowlisted',
        recipients,
        allowDomain: inboundDomain(),
      },
    }
  }

  const forwardTo = process.env.CONTACT_FORWARD_TO.trim()
  const fromAddr = normalizeAddress(event.data.from)
  if (fromAddr && fromAddr === normalizeAddress(forwardTo)) {
    return { status: 200, body: { ok: true, ignored: 'loop_prevention' } }
  }

  const { data, error: forwardError } = await resend.emails.receiving.forward({
    emailId,
    to: forwardTo,
    from: process.env.RESEND_FROM_EMAIL,
  })

  if (forwardError) {
    console.error('inbound forward failed', forwardError)
    return {
      status: 500,
      body: {
        error: `Failed to forward email: ${forwardError.message}`,
      },
    }
  }

  console.info('inbound forwarded', {
    emailId,
    forwardedTo: forwardTo,
    originalTo: matched,
    resendId: data?.id ?? null,
  })

  return {
    status: 200,
    body: {
      ok: true,
      forwardedTo: forwardTo,
      originalTo: matched,
      resendId: data?.id ?? null,
    },
  }
}

/** Web API handler — preferred on Vercel so Svix gets the raw body. */
export async function POST(request) {
  try {
    const payload = await request.text()
    const result = await handleInbound({
      payload,
      headers: request.headers,
    })
    return Response.json(result.body, { status: result.status })
  } catch (err) {
    console.error('inbound forward failed', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Forward failed' },
      { status: 500 },
    )
  }
}

/** Classic Node (req, res) fallback. */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, svix-id, svix-timestamp, svix-signature',
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

  // Prefer Web API path when Vercel passes a Fetch Request.
  if (typeof Request !== 'undefined' && req instanceof Request) {
    const response = await POST(req)
    const text = await response.text()
    res.statusCode = response.status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(text)
    return
  }

  try {
    const payload = await readRawBodyFromNodeReq(req)
    const result = await handleInbound({
      payload,
      headers: req.headers,
    })
    sendJson(res, result.status, result.body)
  } catch (err) {
    console.error('inbound forward failed', err)
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : 'Forward failed',
    })
  }
}
