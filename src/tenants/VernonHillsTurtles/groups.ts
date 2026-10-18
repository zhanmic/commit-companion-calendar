import type { TenantGroup } from '../types'

/**
 * Groups published on vhturtlesswimteam.org (Bronze through Green).
 * Silver Comp is the competitive Silver group and must be matched before Silver.
 * Bronze and Gold use tenant metal colors.
 * Silver Comp uses the rose Devo chip so it stays off the indigo Event accent.
 */
export const VERNON_HILLS_GROUPS: TenantGroup[] = [
  {
    id: 'Bronze',
    label: 'Bronze',
    color: 'var(--team-vh-bronze)',
    alwaysShow: true,
  },
  { id: 'Silver', label: 'Silver', color: 'var(--team-sr)', alwaysShow: true },
  {
    id: 'Silver Comp',
    label: 'Silver Comp',
    color: 'var(--team-devo)',
    alwaysShow: true,
  },
  {
    id: 'Gold',
    label: 'Gold',
    color: 'var(--team-vh-gold)',
    alwaysShow: true,
  },
  { id: 'Green', label: 'Green', color: 'var(--team-jr)', alwaysShow: true },
  { id: 'Other', label: 'Other', color: 'var(--team-other)' },
]

export const VERNON_HILLS_NAMED_GROUP_IDS = VERNON_HILLS_GROUPS.filter(
  (g) => g.id !== 'Other',
).map((g) => g.id)

/** Cancellations that apply to every training group. */
const ALL_GROUPS =
  /\b(?:no|canceled|cancelled)\s+practices?\b|\bpractices?\s+cancell?ed\b|\ball\s+groups\b/i

/**
 * Keyword scan of a Vernon Hills practice title.
 * "Silver Comp" (and the typo "Siver Comp") is not also Silver.
 * "Bonze" is the published typo for Bronze.
 */
export function parseVernonHillsSubTeams(name: string): string[] {
  const raw = name.trim()
  if (ALL_GROUPS.test(raw)) return [...VERNON_HILLS_NAMED_GROUP_IDS]

  let scan = raw.toLowerCase()
  const found = new Set<string>()

  if (/\bsiver\s*comp\b|\bsilver\s*comp\b/.test(scan)) {
    found.add('Silver Comp')
    scan = scan.replace(/\bsiver\s*comp\b|\bsilver\s*comp\b/g, ' ')
  }

  if (/\bbonze\b|\bbronze\b/.test(scan)) found.add('Bronze')
  if (/\bsilver\b/.test(scan)) found.add('Silver')
  if (/\bgold\b/.test(scan)) found.add('Gold')
  if (/\bgreen\b/.test(scan)) found.add('Green')

  if (found.size === 0) return ['Other']
  return VERNON_HILLS_NAMED_GROUP_IDS.filter((id) => found.has(id))
}

const LOCATION_PATTERNS: Array<{ match: RegExp; label: string }> = [
  { match: /\b(?:field|fiel)\s*house\b/i, label: 'VHHS Field House' },
  { match: /\bsullivan\b/i, label: 'Sullivan Center' },
  { match: /\bturtle\s*creek\b|\bTK\b/i, label: 'Turtle Creek' },
  { match: /\blake\s*view\b|\blavkeview\b|\bLV\b|\bLF\b/i, label: 'Lakeview' },
  {
    match: /\bVHHS\b|vernon\s*hills?\s*high\b/i,
    label: 'Vernon Hills High School',
  },
]

/** Pool from the title or Commit description (VHHS, LV, TK, …). */
export function parseVernonHillsLocation(text: string): string | null {
  for (const { match, label } of LOCATION_PATTERNS) {
    if (match.test(text)) return label
  }
  return null
}

export function vernonHillsOccurrenceMatchesTeams(
  teams: string[],
  selected: Set<string>,
): boolean {
  if (selected.size === 0) return false
  return teams.some((t) => selected.has(t))
}
