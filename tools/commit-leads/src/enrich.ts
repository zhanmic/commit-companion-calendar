import {
  extractWebsiteContact,
  fetchScheduleData,
  fetchTeamConfig,
  type WebsiteData2a,
  type WebsiteData2b,
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

export interface StaffContact {
  email: string
  name: string | null
  title: string | null
}

interface StaffCandidate {
  email: string
  name: string | null
  title: string
  bio: string
  receiver: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function coachAddress(value: unknown): string | null {
  if (typeof value === 'string' && value.includes('@')) return value.trim()
  const rec = asRecord(value)
  const address = text(rec?.address)
  return address.includes('@') ? address : null
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isPersonalEmail(email: string): boolean {
  const domain = email.toLowerCase().split('@')[1] ?? ''
  return PERSONAL_PROVIDERS.has(domain)
}

function isOfficialTitle(title: string): boolean {
  return /\b(official|volunteer)\b/i.test(title)
}

/** Leadership in the published title, or the opening of the public bio. */
function roleScore(title: string, bio: string): number {
  const lead = stripHtml(bio).slice(0, 280)
  const blob = `${title} ${lead}`
  let score = 0
  if (/\b(assistant|asst\.?)\b/i.test(title)) score -= 35
  if (isOfficialTitle(title)) score -= 40
  if (/\bhead coach\b/i.test(blob)) score += 55
  else if (
    /\b(senior director|director of|aquatic director|aquatics director)\b/i.test(
      blob,
    )
  ) {
    score += 50
  } else if (/\b(vice president|\bvp\b|president)\b/i.test(blob)) score += 45
  else if (/\b(owner|founder)\b/i.test(blob)) score += 40
  else if (/\b(team admin|administrator|coordinator|manager)\b/i.test(blob)) {
    score += 35
  } else if (/\bdirector\b/i.test(blob)) score += 30
  else if (/\badmin\b/i.test(blob)) score += 22
  else if (/\bcoach\b/i.test(title)) score += 8
  if (/this coach is awesome/i.test(lead)) score -= 5
  return score
}

function publishedBios(
  config: WebsiteData2a,
): Map<string, string> {
  const bios = new Map<string, string>()
  const pages = [
    config.websiteConfig?.newPages,
    config.websiteConfig?.pages,
  ]
  for (const list of pages) {
    if (!Array.isArray(list)) continue
    for (const page of list) {
      const rec = asRecord(page)
      if (!rec || rec.removed === true || rec.published === false) continue
      const blocks = Array.isArray(rec.blocks) ? rec.blocks : []
      for (const block of blocks) {
        const data = asRecord(asRecord(block)?.data)
        const rows = data?.bios
        if (!Array.isArray(rows)) continue
        for (const row of rows) {
          const bio = asRecord(row)
          const coachId = text(bio?.coachId)
          if (!coachId) continue
          const html = text(bio?.bioHtml)
          const prev = bios.get(coachId)
          bios.set(coachId, html || prev || '')
        }
      }
    }
  }
  return bios
}

function receiverIds(config: WebsiteData2a): Set<string> {
  const data = config.websiteConfig?.contact?.data
  const ids = new Set<string>()
  if (Array.isArray(data?.receiverIds)) {
    for (const id of data.receiverIds) {
      const value = text(id)
      if (value) ids.add(value)
    }
  }
  const one = text(data?.receiverId)
  if (one) ids.add(one)
  return ids
}

/**
 * When the team has no office inbox, pick a person published on the coaches
 * page. Directors, head coaches, and admins on an organization domain win.
 */
export function pickPublishedStaffEmail(
  config: WebsiteData2a,
  schedule: WebsiteData2b,
): StaffContact | null {
  const coaches = Array.isArray(schedule.coachesAndAdmins)
    ? schedule.coachesAndAdmins
    : []
  const bios = publishedBios(config)
  const receivers = receiverIds(config)
  const restrictToPage = bios.size > 0
  const candidates: StaffCandidate[] = []

  for (const raw of coaches) {
    const coach = asRecord(raw)
    if (!coach) continue
    const id = text(coach._id)
    if (restrictToPage && !bios.has(id)) continue
    const emails = Array.isArray(coach.emails) ? coach.emails : []
    const email = emails.map(coachAddress).find((value) => value && value.includes('@'))
    if (!email) continue
    if (/@(commitswimming|commit)\.com$/i.test(email) || /example\.com$/i.test(email)) {
      continue
    }
    const profile = asRecord(coach.profile)
    const permissions = asRecord(coach.permissions)
    const first = text(profile?.firstName)
    const last = text(profile?.lastName)
    const name = [first, last].filter(Boolean).join(' ') || text(profile?.name) || null
    candidates.push({
      email: email.toLowerCase(),
      name,
      title: text(permissions?.title),
      bio: bios.get(id) ?? '',
      receiver: receivers.has(id),
    })
  }

  const published = candidates.filter((c) => !isOfficialTitle(c.title))
  const pool = published.length
    ? published
    : candidates.filter((c) => !isPersonalEmail(c.email))
  if (pool.length === 0) return null

  const ranked = [...pool].sort((a, b) => {
    const aScore =
      roleScore(a.title, a.bio) +
      scoreEmail(a.email) +
      (a.receiver ? 20 : 0)
    const bScore =
      roleScore(b.title, b.bio) +
      scoreEmail(b.email) +
      (b.receiver ? 20 : 0)
    return bScore - aScore
  })
  const best = ranked[0]
  return { email: best.email, name: best.name, title: best.title || null }
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

  if (!contact.email && !lead.contact_email) {
    const schedule = await fetchScheduleData(lead.super_team_id, false)
    const staff = pickPublishedStaffEmail(config, schedule)
    if (staff) {
      patch.contact_email = staff.email
      patch.contact_source = 'staff_page'
    }
  }

  // Status stays identified until jobs finish calendar usage, then researched.
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
  })
}
