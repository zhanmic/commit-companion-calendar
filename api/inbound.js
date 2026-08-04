/**
 * POST /api/inbound
 *
 * Resend webhook for `email.received`. Fetches the inbound message and
 * forwards it to CONTACT_FORWARD_TO (Gmail), with Reply-To set to the
 * original sender so replies go to the right person.
 *
 * Dashboard setup:
 * 1. Resend Domains → enable Receiving (MX host: mail)
 * 2. DNS MX mail → inbound-smtp.us-east-1.amazonaws.com (priority 10)
 * 3. Resend Webhooks → URL https://myswimday.com/api/inbound → email.received
 * 4. Copy signing secret → RESEND_WEBHOOK_SECRET on Vercel
 *
 * Env: RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_WEBHOOK_SECRET,
 *      CONTACT_FORWARD_TO, optional CONTACT_INBOUND_ADDRESSES
 */
import { Resend } from 'resend'
import { sendJson } from './_lib/http.js'

const DEFAULT_INBOUND = 'sales@mail.myswimday.com'

/** Keep the raw body for Svix signature verification. */
export const config = {
  api: {
    bodyParser: false,
  },
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
    ...(Array.isArray(data?.received_for) ? data.received_for : []),
  ]
  return list.map(normalizeAddress).filter(Boolean)
}

function isInboundConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY &&
      process.env.RESEND_FROM_EMAIL &&
      process.env.RESEND_WEBHOOK_SECRET &&
      process.env.CONTACT_FORWARD_TO,
  )
}

async function readRawBody(req) {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')

  // bodyParser: false — read the request stream
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  if (chunks.length) return Buffer.concat(chunks).toString('utf8')

  if (req.body && typeof req.body === 'object') {
    return JSON.stringify(req.body)
  }
  return ''
}

function headerValue(req, name) {
  const value = req.headers[name]
  if (Array.isArray(value)) return value[0]
  return value
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
      content_type: attachment.content_type || undefined,
      content_id: attachment.content_id || undefined,
    })
  }
  return attachments.length ? attachments : undefined
}

function forwardSubject(subject, originalTo) {
  const base = subject?.trim() || '(no subject)'
  const tagged = base.toLowerCase().startsWith('fwd:') ? base : `Fwd: ${base}`
  const dest = originalTo ? ` [${originalTo}]` : ''
  return `${tagged}${dest}`
}

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

  if (!isInboundConfigured()) {
    sendJson(res, 503, {
      error: 'Inbound email forwarding is not configured',
    })
    return
  }

  try {
    const payload = await readRawBody(req)
    const id = headerValue(req, 'svix-id')
    const timestamp = headerValue(req, 'svix-timestamp')
    const signature = headerValue(req, 'svix-signature')

    if (!id || !timestamp || !signature) {
      sendJson(res, 400, { error: 'Missing webhook signature headers' })
      return
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
      sendJson(res, 400, { error: 'Invalid webhook signature' })
      return
    }

    if (event.type !== 'email.received') {
      sendJson(res, 200, { ok: true, ignored: event.type })
      return
    }

    const emailId = event.data?.email_id
    if (!emailId) {
      sendJson(res, 400, { error: 'Missing email_id' })
      return
    }

    const allow = inboundAllowlist()
    const recipients = addressesFromEvent(event.data)
    const matched = recipients.filter((addr) => allow.has(addr))
    if (!matched.length) {
      sendJson(res, 200, {
        ok: true,
        ignored: 'recipient_not_allowlisted',
        recipients,
      })
      return
    }

    const forwardTo = process.env.CONTACT_FORWARD_TO.trim()
    const fromAddr = normalizeAddress(event.data.from)
    if (fromAddr && fromAddr === normalizeAddress(forwardTo)) {
      sendJson(res, 200, { ok: true, ignored: 'loop_prevention' })
      return
    }

    const { data: email, error: emailError } =
      await resend.emails.receiving.get(emailId)
    if (emailError) {
      throw new Error(`Failed to fetch email: ${emailError.message}`)
    }

    const attachments = await loadAttachments(resend, emailId)
    const originalTo = matched.join(', ')
    const subject = forwardSubject(
      event.data.subject || email?.subject,
      originalTo,
    )

    const { data, error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: [forwardTo],
      replyTo: fromAddr || undefined,
      subject,
      html: email?.html || undefined,
      text:
        email?.text ||
        [
          `Forwarded message to ${originalTo}`,
          `From: ${event.data.from || '(unknown)'}`,
          `Subject: ${event.data.subject || '(no subject)'}`,
          '',
          '(No text body)',
        ].join('\n'),
      attachments,
    })

    if (sendError) {
      throw new Error(`Failed to forward email: ${sendError.message}`)
    }

    sendJson(res, 200, {
      ok: true,
      forwardedTo: forwardTo,
      originalTo: matched,
      resendId: data?.id ?? null,
    })
  } catch (err) {
    console.error('inbound forward failed', err)
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : 'Forward failed',
    })
  }
}
