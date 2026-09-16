import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR, ensureDataDir } from './config.js'

const CRT_URL = 'https://crt.sh/?q=%25.commitswim.com&output=json'
const CACHE_PATH = join(DATA_DIR, 'commitswim-hosts-cache.json')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const SKIP_SLUG_PREFIXES = [
  'test',
  'www',
  'newclub',
  'example-team',
  'e2etest',
  'dmytroteam',
  'teamwithwebsite',
  'groupondigital',
  'michaelholtz',
  'chadeprice',
  'laurie-karr',
]

export interface CommitswimClub {
  host: string
  websiteUrl: string
  teamName: string
}

interface CacheFile {
  fetchedAt: string
  hosts: string[]
}

function isSkippedSlug(slug: string): boolean {
  return SKIP_SLUG_PREFIXES.some((p) => {
    if (slug === p) return true
    if (slug.startsWith(`${p}-`)) return true
    const rest = slug.slice(p.length)
    return slug.startsWith(p) && /^\d/.test(rest)
  })
}

function titleFromSlug(slug: string): string {
  const tokens = slug.split(/[-_]+/).filter(Boolean)
  return tokens
    .map((t) => {
      if (t === 'ymca') return 'YMCA'
      if (t === 'y') return 'Y'
      if (t === 'lts') return 'LTS'
      if (t.length <= 3 && t === t.toLowerCase()) {
        return t.toUpperCase()
      }
      return t.charAt(0).toUpperCase() + t.slice(1)
    })
    .join(' ')
}

function collectHosts(rows: unknown): string[] {
  if (!Array.isArray(rows)) {
    throw new Error('crt.sh returned unexpected payload')
  }
  const names = new Set<string>()
  for (const row of rows) {
    const raw =
      row && typeof row === 'object' && 'name_value' in row
        ? String((row as { name_value?: unknown }).name_value ?? '')
        : ''
    for (const part of raw.split('\n')) {
      const host = part.trim().toLowerCase()
      if (!host.endsWith('.commitswim.com')) continue
      if (host.includes('*')) continue
      names.add(host.replace(/^www\./, ''))
    }
  }
  names.delete('commitswim.com')
  names.delete('www.commitswim.com')
  return [...names].sort()
}

export async function fetchCommitswimHosts(
  forceRefresh = false,
): Promise<string[]> {
  ensureDataDir()
  if (!forceRefresh && existsSync(CACHE_PATH)) {
    try {
      const cached = JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as CacheFile
      const age = Date.now() - new Date(cached.fetchedAt).getTime()
      if (
        Array.isArray(cached.hosts) &&
        cached.hosts.length > 0 &&
        age < CACHE_TTL_MS
      ) {
        return cached.hosts
      }
    } catch {
      // refresh below
    }
  }

  const res = await fetch(CRT_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CommitLeadsResearchBot/0.1 (+local research; respectful)',
    },
  })
  if (!res.ok) {
    throw new Error(`crt.sh ${res.status} listing commitswim.com certificates`)
  }
  const text = await res.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('crt.sh returned non-JSON (try again in a minute)')
  }
  const hosts = collectHosts(parsed)
  const cache: CacheFile = { fetchedAt: new Date().toISOString(), hosts }
  writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf8')
  return hosts
}

export function filterCommitswimClubs(
  hosts: string[],
  options: { query?: string; limit?: number } = {},
): CommitswimClub[] {
  const query = options.query?.trim().toLowerCase()
  const limit = Math.max(1, Math.min(options.limit ?? 5000, 10_000))
  const clubs: CommitswimClub[] = []
  for (const host of hosts) {
    const slug = host.replace(/\.commitswim\.com$/, '')
    if (!slug || isSkippedSlug(slug)) continue
    if (query && !host.includes(query) && !slug.includes(query)) continue
    clubs.push({
      host,
      websiteUrl: `https://${host}`,
      teamName: titleFromSlug(slug),
    })
    if (clubs.length >= limit) break
  }
  return clubs
}

export async function searchCommitswimClubs(options: {
  query?: string
  limit?: number
  forceRefresh?: boolean
} = {}): Promise<{ clubs: CommitswimClub[]; totalHosts: number }> {
  const hosts = await fetchCommitswimHosts(options.forceRefresh)
  return {
    clubs: filterCommitswimClubs(hosts, options),
    totalHosts: hosts.length,
  }
}

export function commitswimRegionNotes(club: CommitswimClub): string {
  return `source: Commit-hosted site (${club.host})`
}
