import type { TenantGroup } from '../types'

/** Delmar Dolfins practice groups (Sr / Jr / DEVO / Jr Prep). */
export const DELMA_GROUPS: TenantGroup[] = [
  { id: 'Sr', label: 'Sr', color: 'var(--team-sr)', alwaysShow: true },
  { id: 'Jr', label: 'Jr', color: 'var(--team-jr)', alwaysShow: true },
  {
    id: 'Jr Prep',
    label: 'Jr Prep',
    color: 'var(--team-jr-prep)',
    alwaysShow: true,
  },
  { id: 'DEVO', label: 'DEVO', color: 'var(--team-devo)', alwaysShow: true },
  { id: 'Sr/Jr', label: 'Sr/Jr', color: 'var(--team-sr-jr)' },
  { id: 'Other', label: 'Other', color: 'var(--team-other)' },
]

export const DELMA_GROUP_ORDER = DELMA_GROUPS.map((g) => g.id)

export const DELMA_GROUP_COLORS: Record<string, string> = Object.fromEntries(
  DELMA_GROUPS.map((g) => [g.id, g.color]),
)

/** Parse a Delmar practice title fragment into one or more sub-teams. */
export function parseDelmaSubTeams(name: string): string[] {
  const lower = name.trim().toLowerCase()

  if (
    /\bjr\s*prep\b/.test(lower) ||
    /\bjrprep\b/.test(lower) ||
    /\bjunior\s*prep\b/.test(lower)
  ) {
    return ['Jr Prep']
  }

  if (/\bdevo\b/.test(lower) || /\bdevelopmental\b/.test(lower)) {
    return ['DEVO']
  }

  const hasSr = /\bsr\b/.test(lower) || /\bsenior\b/.test(lower)
  const hasJr = /\bjr\b/.test(lower) || /\bjunior\b/.test(lower)

  if (hasSr && hasJr) return ['Sr/Jr']
  if (hasSr) return ['Sr']
  if (hasJr) return ['Jr']

  return ['Other']
}

const LOCATION_PATTERNS: Array<{ match: RegExp; label: string }> = [
  { match: /\belm\b|\belm\s*ave\b/i, label: 'Elm Ave' },
  { match: /\bbchs\b/i, label: 'BCHS' },
  { match: /\bbcms\b/i, label: 'BCMS' },
  { match: /\bacademy\b|\b\baa\b/i, label: 'Academy' },
  { match: /albany country club/i, label: 'Albany Country Club' },
  { match: /\brpi\b/i, label: 'RPI' },
]

/** Keyword fallback for Delmar pool / venue names in a title. */
export function parseDelmaLocation(name: string): string | null {
  for (const { match, label } of LOCATION_PATTERNS) {
    if (match.test(name)) return label
  }
  return null
}

/** Sr/Jr shared sessions appear when either Sr or Jr is selected. */
export function delmaOccurrenceMatchesTeams(
  teams: string[],
  selected: Set<string>,
): boolean {
  if (selected.size === 0) return false
  if (teams.some((t) => selected.has(t))) return true
  if (teams.includes('Sr/Jr') && (selected.has('Sr') || selected.has('Jr'))) {
    return true
  }
  return false
}
