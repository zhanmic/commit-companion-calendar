import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR, ensureDataDir, sleep } from './config.js'

const CRT_URL = 'https://crt.sh/?q=%25.commitswim.com&output=json'
const CERTSPOTTER_URL =
  'https://api.certspotter.com/v1/issuances?domain=commitswim.com&include_subdomains=true&expand=dns_names'
const CACHE_PATH = join(DATA_DIR, 'commitswim-hosts-cache.json')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const USER_AGENT = 'CommitLeadsResearchBot/0.1 (+local research; respectful)'

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

export interface HostFetchResult {
  hosts: string[]
  source: 'cache' | 'crt.sh' | 'certspotter' | 'stale-cache'
  fetchedAt?: string
  notice?: string
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

function addHost(names: Set<string>, raw: string): void {
  const host = raw.trim().toLowerCase()
  if (!host.endsWith('.commitswim.com')) return
  if (host.includes('*')) return
  const normalized = host.replace(/^www\./, '')
  if (normalized === 'commitswim.com') return
  names.add(normalized)
}

function sortedHosts(names: Set<string>): string[] {
  return [...names].sort()
}

function unionHosts(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])].sort()
}

function collectCrtHosts(rows: unknown): string[] {
  if (!Array.isArray(rows)) {
    throw new Error('crt.sh returned unexpected payload')
  }
  const names = new Set<string>()
  for (const row of rows) {
    const raw =
      row && typeof row === 'object' && 'name_value' in row
        ? String((row as { name_value?: unknown }).name_value ?? '')
        : ''
    for (const part of raw.split('\n')) addHost(names, part)
  }
  return sortedHosts(names)
}

function readCache(): { hosts: string[]; fetchedAt: string; fresh: boolean } | null {
  if (!existsSync(CACHE_PATH)) return null
  try {
    const cached = JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as CacheFile
    if (!Array.isArray(cached.hosts) || cached.hosts.length === 0) return null
    if (typeof cached.fetchedAt !== 'string') return null
    const age = Date.now() - new Date(cached.fetchedAt).getTime()
    if (Number.isNaN(age)) return null
    return {
      hosts: cached.hosts,
      fetchedAt: cached.fetchedAt,
      fresh: age >= 0 && age < CACHE_TTL_MS,
    }
  } catch {
    return null
  }
}

function writeCache(hosts: string[]): void {
  const cache: CacheFile = { fetchedAt: new Date().toISOString(), hosts }
  writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf8')
}

async function fetchCrtShHosts(): Promise<string[]> {
  let lastStatus = 0
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(1500)
    let res: Response
    try {
      res = await fetch(CRT_URL, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(20_000),
      })
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError'
      if (attempt === 1) {
        throw new Error(
          timedOut
            ? 'crt.sh timed out listing commitswim.com certificates'
            : 'crt.sh unreachable listing commitswim.com certificates',
        )
      }
      continue
    }
    if (!res.ok) {
      lastStatus = res.status
      if (res.status === 429 || res.status >= 500) continue
      throw new Error(`crt.sh ${res.status} listing commitswim.com certificates`)
    }
    const text = await res.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('crt.sh returned non-JSON')
    }
    const hosts = collectCrtHosts(parsed)
    if (hosts.length === 0) throw new Error('crt.sh returned no commitswim.com hosts')
    return hosts
  }
  throw new Error(`crt.sh ${lastStatus || 502} listing commitswim.com certificates`)
}

async function fetchCertSpotterHosts(): Promise<string[]> {
  const names = new Set<string>()
  let after = ''
  for (let page = 0; page < 40; page++) {
    const url = after
      ? `${CERTSPOTTER_URL}&after=${encodeURIComponent(after)}`
      : CERTSPOTTER_URL
    let res: Response
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      })
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError'
      throw new Error(
        timedOut
          ? 'Cert Spotter timed out listing commitswim.com certificates'
          : 'Cert Spotter unreachable listing commitswim.com certificates',
      )
    }
    if (res.status === 429) {
      throw new Error('Cert Spotter rate limit listing commitswim.com certificates')
    }
    if (!res.ok) {
      throw new Error(
        `Cert Spotter ${res.status} listing commitswim.com certificates`,
      )
    }
    let rows: unknown
    try {
      rows = JSON.parse(await res.text())
    } catch {
      throw new Error('Cert Spotter returned non-JSON')
    }
    if (!Array.isArray(rows)) {
      throw new Error('Cert Spotter returned unexpected payload')
    }
    if (rows.length === 0) break
    let lastId = ''
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const rec = row as { id?: unknown; dns_names?: unknown }
      if (typeof rec.id === 'string' || typeof rec.id === 'number') {
        lastId = String(rec.id)
      }
      if (!Array.isArray(rec.dns_names)) continue
      for (const name of rec.dns_names) addHost(names, String(name))
    }
    if (!lastId || lastId === after) break
    after = lastId
  }
  const hosts = sortedHosts(names)
  if (hosts.length === 0) {
    throw new Error('Cert Spotter returned no commitswim.com hosts')
  }
  return hosts
}

export async function fetchCommitswimHosts(
  forceRefresh = false,
): Promise<HostFetchResult> {
  ensureDataDir()
  const cached = readCache()
  if (!forceRefresh && cached?.fresh) {
    return { hosts: cached.hosts, source: 'cache', fetchedAt: cached.fetchedAt }
  }

  const errors: string[] = []
  try {
    const live = await fetchCrtShHosts()
    const hosts = cached ? unionHosts(cached.hosts, live) : live
    writeCache(hosts)
    return { hosts, source: 'crt.sh' }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  try {
    const live = await fetchCertSpotterHosts()
    const hosts = cached ? unionHosts(cached.hosts, live) : live
    writeCache(hosts)
    const notice = cached
      ? `${errors[0]}. Listed current certificates from Cert Spotter and merged them with the previous host cache.`
      : `${errors[0]}. Listed current certificates from Cert Spotter.`
    return { hosts, source: 'certspotter', notice }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  if (cached) {
    return {
      hosts: cached.hosts,
      source: 'stale-cache',
      fetchedAt: cached.fetchedAt,
      notice: `${errors.join('; ')}. Using cached host list from ${cached.fetchedAt}.`,
    }
  }
  throw new Error(errors.join('; '))
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
} = {}): Promise<{
  clubs: CommitswimClub[]
  totalHosts: number
  source: HostFetchResult['source']
  fetchedAt?: string
  notice?: string
}> {
  const fetched = await fetchCommitswimHosts(options.forceRefresh)
  return {
    clubs: filterCommitswimClubs(fetched.hosts, options),
    totalHosts: fetched.hosts.length,
    source: fetched.source,
    fetchedAt: fetched.fetchedAt,
    notice: fetched.notice,
  }
}

export function commitswimRegionNotes(club: CommitswimClub): string {
  return `source: Commit-hosted site (${club.host})`
}
