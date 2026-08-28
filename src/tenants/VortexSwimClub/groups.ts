import type { TenantGroup } from '../types'

/**
 * Vortex practice groups from Commit titles (Peak … Thunder).
 * Colors are spaced around the hue wheel so neighboring chips/rows stay distinct
 * (especially Peak/Cyclone/Hail blues and Storm/Thunder purples).
 */
export const VORTEX_GROUPS: TenantGroup[] = [
  { id: 'Peak', label: 'Peak', color: 'var(--team-sr)', alwaysShow: true },
  { id: 'Elite', label: 'Elite', color: 'var(--team-jr)', alwaysShow: true },
  { id: 'Prep', label: 'Prep', color: 'var(--team-jr-prep)', alwaysShow: true },
  {
    id: 'Age Group',
    label: 'Age Group',
    color: 'var(--team-devo)',
    alwaysShow: true,
  },
  { id: 'Storm', label: 'Storm', color: 'var(--team-sr-jr)', alwaysShow: true },
  {
    id: 'Cyclone',
    label: 'Cyclone',
    color: 'var(--team-vortex-cyclone)',
    alwaysShow: true,
  },
  {
    id: 'Hail',
    label: 'Hail',
    color: 'var(--team-vortex-hail)',
    alwaysShow: true,
  },
  {
    id: 'Lightning',
    label: 'Lightning',
    color: 'var(--team-vortex-lightning)',
    alwaysShow: true,
  },
  {
    id: 'Thunder',
    label: 'Thunder',
    color: 'var(--team-vortex-thunder)',
    alwaysShow: true,
  },
  { id: 'Other', label: 'Other', color: 'var(--team-other)' },
]

export const VORTEX_NAMED_GROUP_IDS = VORTEX_GROUPS.filter(
  (g) => g.id !== 'Other',
).map((g) => g.id)

/**
 * Keyword scan of a Vortex practice title.
 * "Elite Prep" is Prep only. "Senior Groups" is Peak + Elite + Prep.
 */
export function parseVortexSubTeams(name: string): string[] {
  let scan = name.trim().toLowerCase()
  const found = new Set<string>()

  if (/\bsenior\s+groups?\b/.test(scan)) {
    found.add('Peak')
    found.add('Elite')
    found.add('Prep')
    scan = scan.replace(/\bsenior\s+groups?\b/g, ' ')
  }

  if (/\belite\s*prep\b/.test(scan)) {
    found.add('Prep')
    scan = scan.replace(/\belite\s*prep\b/g, ' ')
  }

  if (/\bpeak\b/.test(scan)) found.add('Peak')
  if (/\belite\b/.test(scan)) found.add('Elite')
  if (/\bprep\b/.test(scan)) found.add('Prep')
  if (/\bage\s*groups?\b/.test(scan)) found.add('Age Group')
  if (/\bstorm\b|\bstrom\b/.test(scan)) found.add('Storm')
  if (/\bcyclone\b/.test(scan)) found.add('Cyclone')
  if (/\bhail\b/.test(scan)) found.add('Hail')
  if (/\blightning\b/.test(scan)) found.add('Lightning')
  if (/\bthunder\b/.test(scan)) found.add('Thunder')

  if (found.size === 0) return ['Other']
  return VORTEX_NAMED_GROUP_IDS.filter((id) => found.has(id))
}

const LOCATION_PATTERNS: Array<{ match: RegExp; label: string }> = [
  { match: /\bmulberry\b/i, label: 'Mulberry' },
  { match: /\bepic\b/i, label: 'EPIC' },
  { match: /\braintree\b/i, label: 'Raintree' },
]

/** Pool / venue from title or Commit description. */
export function parseVortexLocation(text: string): string | null {
  for (const { match, label } of LOCATION_PATTERNS) {
    if (match.test(text)) return label
  }
  return null
}

export function vortexOccurrenceMatchesTeams(
  teams: string[],
  selected: Set<string>,
): boolean {
  if (selected.size === 0) return false
  return teams.some((t) => selected.has(t))
}
