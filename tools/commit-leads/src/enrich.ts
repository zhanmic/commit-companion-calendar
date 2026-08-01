import {
  extractWebsiteContact,
  fetchTeamConfig,
} from './commitApi.js'
import type { ContactSource, Lead } from './db.js'
import { updateLead } from './db.js'
import { fetchPageHtml } from './fingerprint.js'

const EMAIL_RE =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

const PERSONAL_PROVIDERS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'me.com',
  'msn.com',
  'live.com',
  'protonmail.com',
  'proton.me',
])

const OFFICE_HINTS = [
  'info@',
  'office@',
  'admin@',
  'contact@',
  'swim@',
  'team@',
  'club@',
  'hello@',
  'frontdesk@',
  'membership@',
]

function scoreEmail(email: string): number {
  const lower = email.toLowerCase()
  const domain = lower.split('@')[1] ?? ''
  let score = 50
  if (OFFICE_HINTS.some((h) => lower.startsWith(h))) score += 40
  if (PERSONAL_PROVIDERS.has(domain)) score -= 35
  if (lower.includes('coach') && PERSONAL_PROVIDERS.has(domain)) score -= 20
  if (/\.(org|edu|club)$/i.test(domain)) score += 10
  return score
}

/** Prefer published office/team emails over personal inboxes. */
export function pickBestEmail(emails: string[]): string | null {
  const unique = [...new Set(emails.map((e) => e.toLowerCase().trim()))]
  if (unique.length === 0) return null
  unique.sort((a, b) => scoreEmail(b) - scoreEmail(a))
  return unique[0]
}

export function extractEmailsFromHtml(html: string): string[] {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const mailto = [
    ...stripped.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi),
  ].map((m) => m[1])
  const plain = stripped.match(EMAIL_RE) ?? []
  return [...mailto, ...plain].filter(
    (e) =>
      !e.endsWith('.png') &&
      !e.endsWith('.jpg') &&
      !e.includes('example.com') &&
      !e.includes('sentry.io'),
  )
}

function contactPageCandidates(baseUrl: string): string[] {
  try {
    const u = new URL(baseUrl)
    const paths = [
      '/contact',
      '/contact-us',
      '/contactus',
      '/about/contact',
      '/about-us',
      '/staff',
      '/coaches',
    ]
    return paths.map((p) => `${u.origin}${p}`)
  } catch {
    return []
  }
}

export async function enrichFromCommitApi(lead: Lead): Promise<void> {
  if (!lead.super_team_id) {
    throw new Error(`Lead ${lead.id} has no super_team_id`)
  }
  const config = await fetchTeamConfig(lead.super_team_id)
  const contact = extractWebsiteContact(config)

  const patch: Parameters<typeof updateLead>[1] = {
    team_name: contact.teamName ?? lead.team_name,
    timezone: contact.timezone ?? lead.timezone,
  }

  if (contact.websiteUrl && !lead.website_url) {
    patch.website_url = contact.websiteUrl
  }

  if (contact.email || contact.phone || contact.address) {
    patch.contact_email = contact.email ?? lead.contact_email
    patch.contact_phone = contact.phone ?? lead.contact_phone
    patch.contact_address = contact.address ?? lead.contact_address
    if (contact.email) patch.contact_source = 'websiteConfig'
  }

  if (patch.contact_email || lead.super_team_id) {
    patch.status =
      lead.status === 'new' || lead.status === 'identified'
        ? 'researched'
        : lead.status
  }

  updateLead(lead.id, patch)
}

export async function enrichFromSiteContactPages(
  lead: Lead,
  fetchHtml: (url: string) => Promise<string> = fetchPageHtml,
): Promise<void> {
  if (!lead.website_url) return

  const emails: string[] = []
  const pages = [
    lead.website_url,
    ...contactPageCandidates(lead.website_url),
  ]

  for (const page of pages) {
    try {
      const html = await fetchHtml(page)
      emails.push(...extractEmailsFromHtml(html))
    } catch {
      // soft-fail per page
    }
  }

  const best = pickBestEmail(emails)
  if (!best) return

  // Prefer existing websiteConfig email; only fill if missing
  const current = lead.contact_email
  if (current) return

  updateLead(lead.id, {
    contact_email: best,
    contact_source: 'site_html' as ContactSource,
    status:
      lead.status === 'new' || lead.status === 'identified'
        ? 'researched'
        : lead.status,
  })
}
