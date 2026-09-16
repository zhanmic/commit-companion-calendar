import { delmarDolfinsTenant } from './DelmarDolfins'
import { vortexSwimClubTenant } from './VortexSwimClub'
import type { TenantConfig, TenantPublicMeta } from './types'
import { tenantPublicPath } from './types'

/**
 * Register new tenants here.
 * Each tenant owns its Commit team id and practice/meet parsers.
 * Delmar stays first so the landing demo is unchanged.
 * Next unused shortSlug: 3
 */
const TENANTS: TenantConfig[] = [delmarDolfinsTenant, vortexSwimClubTenant]

const BY_SLUG = new Map<string, TenantConfig>()

function registerKey(key: string, tenant: TenantConfig): void {
  const k = key.toLowerCase()
  const existing = BY_SLUG.get(k)
  if (existing && existing !== tenant) {
    throw new Error(
      `Duplicate tenant path "${key}" (${existing.slug} vs ${tenant.slug})`,
    )
  }
  BY_SLUG.set(k, tenant)
}

for (const tenant of TENANTS) {
  registerKey(tenant.slug, tenant)
  if (tenant.shortSlug) registerKey(tenant.shortSlug, tenant)
  for (const alias of tenant.slugAliases ?? []) {
    registerKey(alias, tenant)
  }
}

export function listTenants(): TenantConfig[] {
  return [...TENANTS]
}

export function listTenantMeta(): TenantPublicMeta[] {
  return TENANTS.map((t) => ({
    slug: t.slug,
    displayName: t.displayName,
    path: tenantPublicPath(t),
  }))
}

export function getTenantBySlug(slug: string | undefined | null): TenantConfig | null {
  if (!slug) return null
  return BY_SLUG.get(slug.toLowerCase()) ?? null
}

/** Default tenant when someone hits a bare product URL. */
export const DEFAULT_TENANT_SLUG = delmarDolfinsTenant.slug
