/**
 * POST /api/inbound
 *
 * Resend `email.received` webhook → forward to CONTACT_FORWARD_TO (Gmail).
 *
 * IMPORTANT — set the Resend webhook URL to include the signing secret:
 *   https://myswimday.com/api/inbound?secret=whsec_xxx
 * (same value as Vercel RESEND_WEBHOOK_SECRET)
 *
 * Svix header verify is also attempted when a raw body string is available.
 *
 * Env: RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_WEBHOOK_SECRET,
 *      CONTACT_FORWARD_TO, optional CONTACT_INBOUND_DOMAIN
 */
import { timingSafeEqual } from 'node:crypto'
import { Resend } from 'resend'
import { sendJson } from './_lib/http.js'

const DEFAULT_INBOUND_DOMAIN = 'mail.myswimday.com'
const DEFAULT_INBOUND = `sales@${DEFAULT_INBOUND_DOMAIN}`

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
  if (inboundAllowlist().has(addr)) return true
  return addr.endsWith(`@${inboundDomain()}`)
}

function configured() {
  return {
    resendApiKey: Boolean(process.env.RESEND_API_KEY),
    resendFromEmail: Boolean(process.env.RESEND_FROM_EMAIL),
    webhookSecret: Boolean(process.env.RESEND_WEBHOOK_SECRET),
    contactForwardTo: Boolean(process.env.CONTACT_FORWARD_TO),
    inboundDomain: inboundDomain(),
  }
}

function isInboundConfigured() {
  const c = configured()
  return (
    c.resendApiKey && c.resendFromEmail && c.webhookSecret && c.contactForwardTo
  )
}

function secretsEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function parseEventPayload(payload) {
  if (payload && typeof payload === 'object') return payload
  if (typeof payload !== 'string' || !payload) return null
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

function getQuerySecret(reqOrRequest) {
  if (!reqOrRequest) return ''
  if (typeof reqOrRequest.url === 'string' && reqOrRequest.url.includes('://')) {
    try {
      return new URL(reqOrRequest.url).searchParams.get('secret') || ''
    } catch {
      /* fall through */
    }
  }
  if (reqOrRequest.query && typeof reqOrRequest.query.secret === 'string') {
    return reqOrRequest.query.secret
  }
  // Node IncomingMessage: parse from req.url
  if (typeof reqOrRequest.url === 'string') {
    try {
      return new URL(reqOrRequest.url, 'https://myswimday.com').searchParams.get(
        'secret',
      ) || ''
    } catch {
      return ''
    }
  }
  return ''
}

function getHeader(reqOrRequest, name) {
  if (!reqOrRequest?.headers) return undefined
  if (typeof reqOrRequest.headers.get === 'function') {
    return reqOrRequest.headers.get(name) || undefined
  }
  const value =
    reqOrRequest.headers[name] ?? reqOrRequest.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

async function readPayload(reqOrRequest) {
  // Fetch Request
  if (typeof reqOrRequest.text === 'function') {
    return reqOrRequest.text()
  }
  // Node / Vercel — may already be parsed
  if (typeof reqOrRequest.body === 'string') return reqOrRequest.body
  if (Buffer.isBuffer(reqOrRequest.body)) {
    return reqOrRequest.body.toString('utf8')
  }
  if (reqOrRequest.body && typeof reqOrRequest.body === 'object') {
    return reqOrRequest.body
  }
  // Stream
  const chunks = []
  for await (const chunk of reqOrRequest) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  if (chunks.length) return Buffer.concat(chunks).toString('utf8')
  return ''
}

async function authenticate(reqOrRequest, payload) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  const queryOk = secretsEqual(getQuerySecret(reqOrRequest), webhookSecret)

  const id = getHeader(reqOrRequest, 'svix-id')
  const timestamp = getHeader(reqOrRequest, 'svix-timestamp')
  const signature = getHeader(reqOrRequest, 'svix-signature')

  if (id && timestamp && signature && typeof payload === 'string') {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      return {
        event: resend.webhooks.verify({
          payload,
          headers: { id, timestamp, signature },
          webhookSecret,
        }),
        auth: 'svix',
      }
    } catch (err) {
      console.warn('inbound svix verify failed', err)
      if (!queryOk) {
        const e = new Error(
          'Invalid webhook signature. Set Resend webhook URL to https://myswimday.com/api/inbound?secret=YOUR_RESEND_WEBHOOK_SECRET',
        )
        e.status = 401
        throw e
      }
    }
  } else if (!queryOk) {
    const e = new Error(
      'Missing webhook auth. Set Resend webhook URL to https://myswimday.com/api/inbound?secret=YOUR_RESEND_WEBHOOK_SECRET',
    )
    e.status = 401
    throw e
  }

  const event = parseEventPayload(payload)
  if (!event) {
    const e = new Error('Invalid JSON body')
    e.status = 400
    throw e
  }
  return { event, auth: 'query_secret' }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function displayFrom(event, email) {
  const headerFrom = email?.headers?.from
  if (typeof headerFrom === 'string' && headerFrom.trim()) return headerFrom.trim()
  return event.data?.from || '(unknown sender)'
}

function forwardSubject(subject, originalFrom) {
  const base = (subject || '').trim() || '(no subject)'
  const tagged = base.toLowerCase().startsWith('fwd:') ? base : `Fwd: ${base}`
  const addr = normalizeAddress(originalFrom)
  return addr ? `${tagged} — from ${addr}` : tagged
}

function buildForwardBodies({ event, email, matched, originalFrom }) {
  const subject = event.data?.subject || email?.subject || '(no subject)'
  const originalTo = matched.join(', ')
  const metaLines = [
    '---------- Forwarded message ----------',
    `From: ${originalFrom}`,
    `To: ${originalTo}`,
    `Subject: ${subject}`,
    '',
  ]

  const textBody = [
    ...metaLines,
    email?.text ||
      '(No plain-text body — see HTML part or open in Resend Receiving.)',
  ].join('\n')

  const htmlBody = `
    <div style="margin:0 0 1rem;padding:0.75rem 1rem;border-left:3px solid #0b6e7a;
      background:#f4f7f8;color:#163239;font-family:ui-sans-serif,system-ui,sans-serif;
      font-size:0.9rem;line-height:1.45">
      <div style="font-weight:700;margin-bottom:0.35rem">Forwarded message</div>
      <div><strong>From:</strong> ${escapeHtml(originalFrom)}</div>
      <div><strong>To:</strong> ${escapeHtml(originalTo)}</div>
      <div><strong>Subject:</strong> ${escapeHtml(subject)}</div>
      <div style="margin-top:0.5rem;font-size:0.8rem;color:#6a8086">
        Reply in Gmail to respond to the original sender (Reply-To).
      </div>
    </div>
    ${email?.html || `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(email?.text || '')}</pre>`}
  `

  return { textBody, htmlBody, subject }
}

async function loadAttachments(resend, emailId) {
  const { data, error } = await resend.emails.receiving.attachments.list({
    emailId,
  })
  if (error) {
    throw new Error(`Failed to list attachments: ${error.message}`)
  }

  const items = data?.data ?? []
  if (!items.length) return undefined

  const attachments = []
  for (const attachment of items) {
    if (!attachment.download_url) continue
    const response = await fetch(attachment.download_url)
    if (!response.ok) {
      throw new Error(
        `Failed to download attachment ${attachment.filename || attachment.id}`,
      )
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    attachments.push({
      filename: attachment.filename || 'attachment',
      content: buffer.toString('base64'),
      contentType: attachment.content_type || undefined,
      contentId: attachment.content_id || undefined,
    })
  }
  return attachments.length ? attachments : undefined
}

async function forwardReceivedEmail(event) {
  const emailId = event.data?.email_id
  if (!emailId) {
    const e = new Error('Missing email_id')
    e.status = 400
    throw e
  }

  const recipients = addressesFromEvent(event.data)
  const matched = recipients.filter(isAllowedRecipient)
  if (!matched.length) {
    console.warn('inbound ignored: recipient_not_allowlisted', recipients)
    return {
      ok: true,
      ignored: 'recipient_not_allowlisted',
      recipients,
      allowDomain: inboundDomain(),
    }
  }

  const forwardTo = process.env.CONTACT_FORWARD_TO.trim()
  const fromAddr = normalizeAddress(event.data.from)
  if (fromAddr && fromAddr === normalizeAddress(forwardTo)) {
    return { ok: true, ignored: 'loop_prevention' }
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { data: email, error: emailError } =
    await resend.emails.receiving.get(emailId)
  if (emailError) {
    const e = new Error(`Failed to fetch email: ${emailError.message}`)
    e.status = 500
    throw e
  }

  const originalFrom = displayFrom(event, email)
  const { textBody, htmlBody, subject } = buildForwardBodies({
    event,
    email,
    matched,
    originalFrom,
  })
  const attachments = await loadAttachments(resend, emailId)

  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: [forwardTo],
    // So Gmail Reply goes to the real sender, not sales@mail…
    replyTo: fromAddr || undefined,
    subject: forwardSubject(subject, originalFrom),
    text: textBody,
    html: htmlBody,
    attachments,
  })

  if (error) {
    const e = new Error(`Failed to forward email: ${error.message}`)
    e.status = 500
    throw e
  }

  console.info('inbound forwarded', {
    emailId,
    forwardedTo: forwardTo,
    originalFrom,
    originalTo: matched,
    resendId: data?.id ?? null,
  })

  return {
    ok: true,
    forwardedTo: forwardTo,
    originalFrom,
    originalTo: matched,
    resendId: data?.id ?? null,
  }
}

async function handle(reqOrRequest) {
  if (!isInboundConfigured()) {
    return {
      status: 503,
      body: {
        error: 'Inbound email forwarding is not configured',
        ...configured(),
      },
    }
  }

  const payload = await readPayload(reqOrRequest)
  const { event, auth } = await authenticate(reqOrRequest, payload)

  if (event.type !== 'email.received') {
    return { status: 200, body: { ok: true, ignored: event.type, auth } }
  }

  const result = await forwardReceivedEmail(event)
  return { status: 200, body: { ...result, auth } }
}

export async function GET() {
  const c = configured()
  return Response.json({
    ok: isInboundConfigured(),
    ...c,
    hint: 'Set Resend webhook URL to https://myswimday.com/api/inbound?secret=YOUR_RESEND_WEBHOOK_SECRET',
  })
}

export async function POST(request) {
  try {
    const result = await handle(request)
    return Response.json(result.body, { status: result.status })
  } catch (err) {
    console.error('inbound forward failed', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Forward failed' },
      { status: err?.status || 500 },
    )
  }
}

/** Node/Vercel default export — required for Vite API routes. */
export default async function handler(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    sendJson(res, 200, {
      ok: isInboundConfigured(),
      ...configured(),
      hint: 'Set Resend webhook URL to https://myswimday.com/api/inbound?secret=YOUR_RESEND_WEBHOOK_SECRET',
    })
    return
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, svix-id, svix-timestamp, svix-signature',
    )
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, POST, OPTIONS')
    res.end('Method Not Allowed')
    return
  }

  try {
    const result = await handle(req)
    sendJson(res, result.status, result.body)
  } catch (err) {
    console.error('inbound forward failed', err)
    sendJson(res, err?.status || 500, {
      error: err instanceof Error ? err.message : 'Forward failed',
    })
  }
}
