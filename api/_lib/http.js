/** Shared helpers for Vercel Node serverless handlers. */

/**
 * Read a query string param from either Vercel’s req.query helper or the raw URL.
 * Vite / some Node runtimes leave req.query empty — always fall back to URL parse.
 */
export function queryParam(req, name) {
  if (!req || !name) return ''
  const fromQuery = req.query?.[name]
  if (typeof fromQuery === 'string') return fromQuery
  if (Array.isArray(fromQuery) && typeof fromQuery[0] === 'string') {
    return fromQuery[0]
  }
  const rawUrl = typeof req.url === 'string' ? req.url : ''
  if (!rawUrl) return ''
  try {
    const url = rawUrl.includes('://')
      ? new URL(rawUrl)
      : new URL(rawUrl, 'https://myswimday.com')
    return url.searchParams.get(name) || ''
  } catch {
    return ''
  }
}

export function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

export function sendText(res, status, text, contentType = 'text/plain') {
  res.statusCode = status
  res.setHeader('Content-Type', `${contentType}; charset=utf-8`)
  res.setHeader('Cache-Control', 'no-store')
  res.end(text)
}

export function sendHtml(res, status, html) {
  sendText(res, status, html, 'text/html')
}

export function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return null
    }
  }
  return null
}

export function appBaseUrl(req) {
  const fromEnv = process.env.APP_BASE_URL?.replace(/\/$/, '')
  if (fromEnv) return fromEnv
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  if (host) return `${proto}://${host}`
  return 'https://myswimday.com'
}

/** Simple status page used by confirm / unsubscribe GET handlers. */
export function statusPage({ title, heading, message, linkHref, linkLabel }) {
  const link = linkHref
    ? `<p style="margin-top:1.5rem"><a href="${escapeHtml(linkHref)}" style="color:#0b6e7a;font-weight:700">${escapeHtml(linkLabel || 'Open schedule')}</a></p>`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: Georgia, "Times New Roman", serif; background:
      radial-gradient(ellipse at 20% 0%, #d9f3f6 0%, transparent 50%),
      radial-gradient(ellipse at 80% 100%, #e8f0ff 0%, transparent 45%),
      #f4f7f8; color: #163239; }
    main { width: min(28rem, calc(100vw - 2rem)); padding: 2rem 1.5rem;
      border: 1px solid rgba(22,50,57,.12); border-radius: 1rem;
      background: rgba(255,255,255,.88); box-shadow: 0 12px 40px rgba(22,50,57,.08); }
    h1 { margin: 0 0 .75rem; font-size: 1.45rem; }
    p { margin: 0; line-height: 1.5; color: #3d5a62; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(message)}</p>
    ${link}
  </main>
</body>
</html>`
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
