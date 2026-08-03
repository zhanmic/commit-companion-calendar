/**
 * Thin Resend HTTP client.
 * Env: RESEND_API_KEY, RESEND_FROM_EMAIL (e.g. My Swim Day <schedule@myswimday.com>)
 */

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL)
}

export async function sendEmail({ to, subject, html, text, headers }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) {
    throw new Error('Missing RESEND_API_KEY or RESEND_FROM_EMAIL')
  }

  const body = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
  }
  if (headers && Object.keys(headers).length) {
    body.headers = headers
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      data?.message || data?.error?.message || `Resend HTTP ${res.status}`
    throw new Error(message)
  }
  return data
}
