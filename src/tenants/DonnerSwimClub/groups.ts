import type { TenantGroup } from '../types'

/**
 * Groups published on donnerswimclub.com (Pre Team through Senior).
 * "D Group" in Commit titles is Developmental.
 * Colors reuse the shared palette so chips stay distinct.
 */
export const DONNER_GROUPS: TenantGroup[] = [
  {
    id: 'Pre Team',
    label: 'Pre Team',
    color: 'var(--team-jr-prep)',
    alwaysShow: true,
  },
  { id: 'Novice', label: 'Novice', color: 'var(--team-devo)', alwaysShow: true },
  {
    id: 'Developmental',
    label: 'Developmental',
    color: 'var(--team-jr)',
    alwaysShow: true,
  },
  {
    id: 'Age Group',
    label: 'Age Group',
    color: 'var(--team-sr)',
    alwaysShow: true,
  },
  {
    id: 'Senior',
    label: 'Senior',
    color: 'var(--team-sr-jr)',
    alwaysShow: true,
  },
  { id: 'Other', label: 'Other', color: 'var(--team-other)' },
]

export const DONNER_NAMED_GROUP_IDS = DONNER_GROUPS.filter(
  (g) => g.id !== 'Other',
).map((g) => g.id)

/** Cancellations that apply to every training group. */
const ALL_GROUPS =
  /\b(?:no|canceled|cancelled)\s+practices?\b|\bpractices?\s+cancell?ed\b|\ball\s+groups\b/i

/**
 * Keyword scan of a Donner practice title.
 * Combined titles such as "Age Group/Senior" and "D Group/Senior" tag both groups.
 */
export function parseDonnerSubTeams(name: string): string[] {
  const raw = name.trim()
  if (ALL_GROUPS.test(raw)) return [...DONNER_NAMED_GROUP_IDS]

  let scan = raw.toLowerCase()
  const found = new Set<string>()

  if (/\bd\s*-?\s*groups?\b/.test(scan)) {
    found.add('Developmental')
    scan = scan.replace(/\bd\s*-?\s*groups?\b/g, ' ')
  }

  if (/\bpre\s*-?\s*teams?\b/.test(scan)) found.add('Pre Team')
  if (/\bnovice\b/.test(scan)) found.add('Novice')
  if (/\bdevelopment(?:al)?\b/.test(scan) || /\bdevo\b/.test(scan)) {
    found.add('Developmental')
  }
  if (/\bage\s*-?\s*groups?\b/.test(scan)) found.add('Age Group')
  if (/\bseniors?\b/.test(scan)) found.add('Senior')

  if (found.size === 0) return ['Other']
  return DONNER_NAMED_GROUP_IDS.filter((id) => found.has(id))
}

const LOCATION_PATTERNS: Array<{ match: RegExp; label: string }> = [
  { match: /\beast\b/i, label: 'Columbus East' },
  { match: /\bnorth\b/i, label: 'Columbus North' },
  { match: /\bdonner\s*park\b/i, label: 'Donner Park' },
]

/** Pool from the title or Commit description (EAST / NORTH). */
export function parseDonnerLocation(text: string): string | null {
  for (const { match, label } of LOCATION_PATTERNS) {
    if (match.test(text)) return label
  }
  return null
}

export function donnerOccurrenceMatchesTeams(
  teams: string[],
  selected: Set<string>,
): boolean {
  if (selected.size === 0) return false
  return teams.some((t) => selected.has(t))
}
