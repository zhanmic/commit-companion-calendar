const API_BASE = 'https://utility.commitswimming.com'

export interface WebsiteContactData {
  email?: string
  phone?: string
  address?: string
  [key: string]: unknown
}

export interface WebsiteConfig {
  url?: string
  contact?: {
    data?: WebsiteContactData
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface WebsiteData2a {
  superTeam?: {
    _id?: string
    name?: string
    timezone?: string
  }
  websiteConfig?: WebsiteConfig
  settings?: unknown
}

export interface WebsiteData2b {
  events?: unknown[]
  meets?: unknown[]
  programs?: unknown[]
  coachesAndAdmins?: unknown[]
  [key: string]: unknown
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`Commit API ${res.status}: ${path}`)
  }
  return res.json() as Promise<T>
}

export function fetchTeamConfig(superTeamId: string): Promise<WebsiteData2a> {
  return getJson<WebsiteData2a>(
    `/website-data-2a?superTeamId=${encodeURIComponent(superTeamId)}`,
  )
}

export function fetchScheduleData(
  superTeamId: string,
  includeMeets = false,
): Promise<WebsiteData2b> {
  return getJson<WebsiteData2b>(
    `/website-data-2b?superTeamId=${encodeURIComponent(superTeamId)}&includeMeets=${includeMeets ? 'true' : 'false'}`,
  )
}

/** Pull office-style contact fields from 2a websiteConfig. */
export function extractWebsiteContact(config: WebsiteData2a): {
  email: string | null
  phone: string | null
  address: string | null
  websiteUrl: string | null
  teamName: string | null
  timezone: string | null
} {
  const data = config.websiteConfig?.contact?.data
  const email =
    typeof data?.email === 'string' && data.email.includes('@')
      ? data.email.trim()
      : null
  const phone = typeof data?.phone === 'string' ? data.phone.trim() : null
  const address =
    typeof data?.address === 'string' ? data.address.trim() : null
  const websiteUrl =
    typeof config.websiteConfig?.url === 'string'
      ? config.websiteConfig.url.trim()
      : null

  return {
    email,
    phone,
    address,
    websiteUrl,
    teamName: config.superTeam?.name?.trim() || null,
    timezone: config.superTeam?.timezone?.trim() || null,
  }
}
