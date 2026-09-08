import type { TenantConfig, TenantGroup } from '../tenants/types'

export const MEET_COLOR = 'var(--team-meet)'
export const EVENT_COLOR = 'var(--team-event)'

export function groupOrder(tenant: TenantConfig): string[] {
  return tenant.groups.map((g) => g.id)
}

export function groupColorMap(tenant: TenantConfig): Record<string, string> {
  return Object.fromEntries(tenant.groups.map((g) => [g.id, g.color]))
}

export function colorForGroup(
  tenant: TenantConfig,
  groupId: string | undefined,
): string {
  if (!groupId) return 'var(--team-other)'
  return (
    tenant.groups.find((g) => g.id === groupId)?.color ?? 'var(--team-other)'
  )
}

/**
 * Groups to show for a multi-group practice given the active filter.
 * When the filter intersects the session's groups, prefer that intersection
 * (so Elite-only filter shows Elite, not Peak, for a Peak+Elite session).
 * Otherwise fall back to the full subTeams list.
 */
export function visiblePracticeGroups(
  teams: string[],
  selected?: Set<string>,
): string[] {
  if (teams.length === 0) return teams
  if (!selected || selected.size === 0) return teams
  const matched = teams.filter((t) => selected.has(t))
  return matched.length > 0 ? matched : teams
}

/** Accent group for a practice card — first of {@link visiblePracticeGroups}. */
export function accentPracticeGroup(
  teams: string[],
  selected?: Set<string>,
): string | undefined {
  return visiblePracticeGroups(teams, selected)[0]
}

/** Compact label for fit-mode / card team text (e.g. "Peak / Elite"). */
export function practiceGroupLabel(
  teams: string[],
  selected?: Set<string>,
): string {
  return visiblePracticeGroups(teams, selected).join(' / ')
}

/** One run of a practice title; `color` is set on the group words. */
export interface NameSegment {
  text: string
  color?: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Split a practice title so each group word can carry its own group color,
 * e.g. "Hail, Thunder - Swim Practice". Titles that never spell out their
 * group (Vortex's "Senior Groups …", or a typo like "Strom") come back as one
 * plain segment.
 */
export function highlightGroupsInName(
  tenant: TenantConfig,
  name: string,
  teams: string[],
): NameSegment[] {
  const colorByTerm = new Map<string, string>()
  for (const id of teams) {
    const group = findGroup(tenant, id)
    for (const term of [group?.label, id]) {
      if (!term || term.trim().length < 2) continue
      colorByTerm.set(term.toLowerCase(), colorForGroup(tenant, id))
    }
  }

  // Longest first so "Sr/Jr" wins over the "Sr" and "Jr" inside it.
  const terms = [...colorByTerm.keys()].sort((a, b) => b.length - a.length)
  if (terms.length === 0) return [{ text: name }]

  const pattern = new RegExp(`\\b(${terms.map(escapeRegExp).join('|')})\\b`, 'gi')
  const segments: NameSegment[] = []
  let cursor = 0
  for (const match of name.matchAll(pattern)) {
    const start = match.index
    if (start > cursor) segments.push({ text: name.slice(cursor, start) })
    segments.push({
      text: match[0],
      color: colorByTerm.get(match[0].toLowerCase()),
    })
    cursor = start + match[0].length
  }
  if (cursor < name.length) segments.push({ text: name.slice(cursor) })
  return segments
}

export function alwaysShowGroups(tenant: TenantConfig): string[] {
  return tenant.groups.filter((g) => g.alwaysShow).map((g) => g.id)
}

export function findGroup(
  tenant: TenantConfig,
  id: string,
): TenantGroup | undefined {
  return tenant.groups.find((g) => g.id === id)
}
