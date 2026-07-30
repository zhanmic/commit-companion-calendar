export interface FingerprintResult {
  superTeamId: string | null
  confidence: number
  evidence: string[]
}

const SUPER_ID_PATTERNS = [
  /superTeamId["'\s:=]+["']?([A-Za-z0-9_-]{10,})/gi,
  /super_team_id["'\s:=]+["']?([A-Za-z0-9_-]{10,})/gi,
  /[?&]superTeamId=([A-Za-z0-9_-]{10,})/gi,
]

const COMMIT_MARKERS = [
  {
    label: 'website-data-2a',
    re: /utility\.commitswimming\.com\/website-data-2a/i,
    weight: 0.45,
  },
  {
    label: 'website-data-2b',
    re: /utility\.commitswimming\.com\/website-data-2b/i,
    weight: 0.45,
  },
  {
    label: 'commitswimming-cdn',
    re: /cdn\.commitswimming\.com|static\.commitswimming\.com/i,
    weight: 0.25,
  },
  {
    label: 'commitswimming-domain',
    re: /commitswimming\.com/i,
    weight: 0.15,
  },
  {
    label: 'powered-by-commit',
    re: /powered\s+by\s+commit|commit\s+swimming/i,
    weight: 0.2,
  },
]

function uniqueIds(html: string): string[] {
  const found = new Set<string>()
  for (const pattern of SUPER_ID_PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(html)) !== null) {
      found.add(match[1])
    }
  }
  return [...found]
}

/**
 * Detect Commit usage markers and extract superTeamId from page HTML/JS.
 */
export function fingerprintHtml(html: string): FingerprintResult {
  const evidence: string[] = []
  let confidence = 0

  for (const marker of COMMIT_MARKERS) {
    if (marker.re.test(html)) {
      evidence.push(marker.label)
      confidence += marker.weight
    }
  }

  const ids = uniqueIds(html)
  let superTeamId: string | null = null
  if (ids.length === 1) {
    superTeamId = ids[0]
    evidence.push(`superTeamId:${superTeamId}`)
    confidence += 0.5
  } else if (ids.length > 1) {
    superTeamId = ids[0]
    evidence.push(`superTeamId_candidates:${ids.join(',')}`)
    confidence += 0.35
  }

  return {
    superTeamId,
    confidence: Math.min(1, Math.round(confidence * 100) / 100),
    evidence,
  }
}

export async function fetchPageHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'CommitLeadsResearchBot/0.1 (+local research; respectful)',
    },
    redirect: 'follow',
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`)
  }
  return res.text()
}
