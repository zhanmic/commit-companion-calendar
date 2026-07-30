import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { DATA_DIR, ensureDataDir } from './config.js'
import { join } from 'node:path'

const USAS_SEARCH_URL =
  'https://club-api.usaswimming.org/swims/ClubFacilityMap/search'

const CACHE_PATH = join(DATA_DIR, 'usas-clubs-cache.json')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export interface UsaFacilityRow {
  orgUnitKey?: number
  clubName?: string
  websiteAddress?: string
  contactEmailAddress?: string
  contactPhoneNumber?: string
  contactName?: string
  city?: string
  stateCode?: string
  postalCode?: string
  address1?: string
  address2?: string
  facilityName?: string
  clubSize?: number
  clubExcellenceLevel?: string
  finderType?: string
}

export interface UsaClub {
  orgUnitKey: number | null
  clubName: string
  websiteUrl: string | null
  contactEmail: string | null
  contactPhone: string | null
  contactName: string | null
  cities: string[]
  stateCode: string | null
  postalCodes: string[]
  address: string | null
  facilities: string[]
  clubSize: number | null
  excellence: string | null
}

export interface UsaSearchFilters {
  /** Two-letter state code, e.g. NY */
  state?: string
  /** Match club name, city, or website */
  query?: string
  /** 5-digit ZIP prefix */
  zip?: string
  /** Max clubs to return after filter/dedupe */
  limit?: number
  /** Skip clubs with no website (default true) */
  requireWebsite?: boolean
}

interface CacheFile {
  fetchedAt: string
  rows: UsaFacilityRow[]
}

const DEFAULT_PAYLOAD = {
  finderType: 'USA Swimming Club',
  clubExcellenceLevel0: 'NA',
  clubExcellenceLevel1: 'Bronze',
  clubExcellenceLevel2: 'Silver',
  clubExcellenceLevel3: 'Gold',
  isSafeSportRecognized: 2,
}

export async function fetchUsaFacilityRows(
  forceRefresh = false,
): Promise<UsaFacilityRow[]> {
  ensureDataDir()
  if (!forceRefresh && existsSync(CACHE_PATH)) {
    try {
      const cached = JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as CacheFile
      const age = Date.now() - new Date(cached.fetchedAt).getTime()
      if (
        Array.isArray(cached.rows) &&
        cached.rows.length > 0 &&
        age < CACHE_TTL_MS
      ) {
        return cached.rows
      }
    } catch {
      // refresh below
    }
  }

  const res = await fetch(USAS_SEARCH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: 'https://www.usaswimming.org',
      Referer: 'https://www.usaswimming.org/home/find-a-team',
    },
    body: JSON.stringify(DEFAULT_PAYLOAD),
  })
  if (!res.ok) {
    throw new Error(`USA Swimming club API ${res.status}`)
  }
  const rows = (await res.json()) as UsaFacilityRow[]
  if (!Array.isArray(rows)) {
    throw new Error('USA Swimming club API returned unexpected payload')
  }
  const cache: CacheFile = { fetchedAt: new Date().toISOString(), rows }
  writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf8')
  return rows
}

function normalizeWebsite(raw: string | undefined | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed || trimmed === 'NA' || trimmed === 'N/A') return null
  try {
    const withProto = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`
    const u = new URL(withProto)
    if (u.protocol === 'http:') u.protocol = 'https:'
    u.hash = ''
    u.hostname = u.hostname.toLowerCase()
    let href = u.href
    if (href.endsWith('/')) href = href.slice(0, -1)
    return href
  } catch {
    return trimmed
  }
}

function clubKey(row: UsaFacilityRow): string {
  if (row.orgUnitKey != null) return `org:${row.orgUnitKey}`
  const name = (row.clubName ?? '').trim().toLowerCase()
  const state = (row.stateCode ?? '').trim().toUpperCase()
  const web = normalizeWebsite(row.websiteAddress) ?? ''
  return `name:${name}|${state}|${web}`
}

/** Dedupe multi-facility rows into one club each. */
export function dedupeClubs(rows: UsaFacilityRow[]): UsaClub[] {
  const map = new Map<string, UsaClub>()
  for (const row of rows) {
    if ((row.finderType || '').includes('Learn')) continue
    const name = (row.clubName ?? '').trim()
    if (!name) continue
    const key = clubKey(row)
    const existing = map.get(key)
    const website = normalizeWebsite(row.websiteAddress)
    const city = (row.city ?? '').trim()
    const zip = (row.postalCode ?? '').trim()
    const facility = (row.facilityName ?? '').trim()
    const addressParts = [row.address1, row.address2, city, row.stateCode, zip]
      .map((p) => (p ?? '').trim())
      .filter(Boolean)

    if (!existing) {
      map.set(key, {
        orgUnitKey: row.orgUnitKey ?? null,
        clubName: name,
        websiteUrl: website,
        contactEmail: cleanContact(row.contactEmailAddress),
        contactPhone: cleanContact(row.contactPhoneNumber),
        contactName: cleanContact(row.contactName),
        cities: city ? [city] : [],
        stateCode: normalizeStateCode(row.stateCode),
        postalCodes: zip ? [zip] : [],
        address: addressParts.join(', ') || null,
        facilities: facility ? [facility] : [],
        clubSize: typeof row.clubSize === 'number' ? row.clubSize : null,
        excellence: cleanContact(row.clubExcellenceLevel),
      })
      continue
    }

    if (!existing.websiteUrl && website) existing.websiteUrl = website
    if (!existing.contactEmail && cleanContact(row.contactEmailAddress)) {
      existing.contactEmail = cleanContact(row.contactEmailAddress)
    }
    if (!existing.contactPhone && cleanContact(row.contactPhoneNumber)) {
      existing.contactPhone = cleanContact(row.contactPhoneNumber)
    }
    if (city && !existing.cities.includes(city)) existing.cities.push(city)
    if (zip && !existing.postalCodes.includes(zip)) existing.postalCodes.push(zip)
    if (facility && !existing.facilities.includes(facility)) {
      existing.facilities.push(facility)
    }
    if (
      existing.clubSize == null &&
      typeof row.clubSize === 'number'
    ) {
      existing.clubSize = row.clubSize
    }
    if (!existing.stateCode) {
      existing.stateCode = normalizeStateCode(row.stateCode)
    }
  }
  return [...map.values()]
}

function normalizeStateCode(raw: string | undefined | null): string | null {
  if (!raw) return null
  const t = raw.trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(t)) return t
  const m = t.match(/\(([A-Z]{2})\)/)
  if (m) return m[1]
  return t.slice(0, 2) || null
}

function cleanContact(value: string | undefined | null): string | null {
  if (!value) return null
  const v = value.trim()
  if (!v || v === 'NA' || v === 'N/A') return null
  return v
}

export function filterUsaClubs(
  clubs: UsaClub[],
  filters: UsaSearchFilters,
): UsaClub[] {
  const state = filters.state?.trim().toUpperCase()
  const query = filters.query?.trim().toLowerCase()
  const zip = filters.zip?.trim().replace(/\D/g, '').slice(0, 5)
  const requireWebsite = filters.requireWebsite !== false
  const limit = Math.max(1, Math.min(filters.limit ?? 5000, 10_000))

  let out = clubs.filter((c) => {
    if (requireWebsite && !c.websiteUrl) return false
    if (state && c.stateCode !== state) return false
    if (zip) {
      const hit = c.postalCodes.some((p) => p.replace(/\D/g, '').startsWith(zip))
      if (!hit) return false
    }
    if (query) {
      const hay = [
        c.clubName,
        c.websiteUrl,
        c.cities.join(' '),
        c.stateCode,
        c.contactName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(query)) return false
    }
    return true
  })

  out.sort((a, b) => {
    const size = (b.clubSize ?? 0) - (a.clubSize ?? 0)
    if (size !== 0) return size
    return a.clubName.localeCompare(b.clubName)
  })

  return out.slice(0, limit)
}

export async function searchUsaClubs(
  filters: UsaSearchFilters,
  options: { forceRefresh?: boolean } = {},
): Promise<{ clubs: UsaClub[]; totalFacilities: number; totalClubs: number }> {
  const rows = await fetchUsaFacilityRows(options.forceRefresh)
  const all = dedupeClubs(rows)
  return {
    clubs: filterUsaClubs(all, filters),
    totalFacilities: rows.length,
    totalClubs: all.length,
  }
}

export function usaRegionNotes(club: UsaClub): string {
  const bits = [
    club.stateCode,
    club.cities[0],
    club.clubSize != null ? `size ${club.clubSize}` : null,
    club.excellence && club.excellence !== 'NA'
      ? `excellence ${club.excellence}`
      : null,
    'source: USA Swimming Find a Team',
  ].filter(Boolean)
  return bits.join(' · ')
}
