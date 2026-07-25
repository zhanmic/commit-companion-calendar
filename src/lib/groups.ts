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

export function alwaysShowGroups(tenant: TenantConfig): string[] {
  return tenant.groups.filter((g) => g.alwaysShow).map((g) => g.id)
}

export function findGroup(
  tenant: TenantConfig,
  id: string,
): TenantGroup | undefined {
  return tenant.groups.find((g) => g.id === id)
}
