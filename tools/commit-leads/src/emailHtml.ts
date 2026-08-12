import { DEMO_CALENDAR_URL, SITE_URL } from './config.js'

/** True if body already looks like HTML email content. */
export function looksLikeHtml(body: string): boolean {
  return /<\/?(?:p|br|a|div|ul|ol|li|strong|em|b|i|h[1-6])\b/i.test(body)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function linkifyPlainUrls(escaped: string): string {
  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1">$1</a>',
  )
}

/** Convert plain-text draft body into simple email HTML. */
export function plainTextToHtml(body: string): string {
  const trimmed = body.replace(/\r\n/g, '\n').trim()
  if (!trimmed) return ''
  const paras = trimmed.split(/\n{2,}/)
  return paras
    .map((p) => {
      const withBreaks = escapeHtml(p).replace(/\n/g, '<br>\n')
      return `<p>${linkifyPlainUrls(withBreaks)}</p>`
    })
    .join('\n')
}

/**
 * Ensure body is HTML and includes both product links as clickable anchors.
 */
export function ensureHtmlDraftBody(body: string): string {
  let html = body.trim()
  if (!html) return html
  if (!looksLikeHtml(html)) html = plainTextToHtml(html)

  const hasSite = html.includes(SITE_URL)
  const hasDemo = html.includes(DEMO_CALENDAR_URL)
  if (hasSite && hasDemo) {
    // Upgrade bare URLs to anchors if the model pasted plain https text
    return ensureAnchorsForProductUrls(html)
  }

  const bits: string[] = []
  if (!hasSite) {
    bits.push(
      `<a href="${SITE_URL}">Product overview (screenshots)</a>`,
    )
  }
  if (!hasDemo) {
    bits.push(
      `<a href="${DEMO_CALENDAR_URL}">Live Delmar Dolphins demo</a>`,
    )
  }
  const linkBlock = `<p>${bits.join('<br>\n')}</p>`

  // Prefer insert before a closing sign-off paragraph when possible
  const signOff = html.match(
    /<p>(?:Thanks|Thank you|Best|Cheers|Regards|Warmly)[\s\S]*?<\/p>\s*$/i,
  )
  if (signOff && signOff.index != null) {
    return `${html.slice(0, signOff.index).trimEnd()}\n${linkBlock}\n${html.slice(signOff.index)}`.trim()
  }
  return `${html}\n${linkBlock}`.trim()
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function ensureAnchorsForProductUrls(html: string): string {
  let out = html
  for (const url of [SITE_URL, DEMO_CALENDAR_URL]) {
    if (!out.includes(url)) continue
    const alreadyLinked = new RegExp(`href=["']${escapeRegExp(url)}["']`, 'i')
    if (alreadyLinked.test(out)) continue
    out = out.replace(new RegExp(escapeRegExp(url), 'g'), (match, offset, full) => {
      const before = full.slice(Math.max(0, offset - 8), offset)
      if (/href=["']$/i.test(before)) return match
      return `<a href="${url}">${url}</a>`
    })
  }
  return out
}

/** Wrap a fragment for Mail.app html content. */
export function wrapEmailHtmlDocument(fragment: string): string {
  const inner = fragment.trim()
  if (/<html[\s>]/i.test(inner)) return inner
  return `<html><body style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45;color:#222;">${inner}</body></html>`
}

/** Strip tags for mailto / plain fallbacks. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
