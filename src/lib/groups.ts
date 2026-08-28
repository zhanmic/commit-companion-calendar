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

export function alwaysShowGroups(tenant: TenantConfig): string[] {
  return tenant.groups.filter((g) => g.alwaysShow).map((g) => g.id)
}

export function findGroup(
  tenant: TenantConfig,
  id: string,
): TenantGroup | undefined {
  return tenant.groups.find((g) => g.id === id)
}
