import { delmarDolfinsTenant } from './DelmarDolfins'
import { vortexSwimClubTenant } from './VortexSwimClub'
import type { TenantConfig, TenantPublicMeta } from './types'

/**
 * Register new tenants here.
 * Each tenant owns its Commit team id and practice/meet parsers.
 * Delmar stays first so the landing demo is unchanged.
 */
const TENANTS: TenantConfig[] = [delmarDolfinsTenant, vortexSwimClubTenant]

const BY_SLUG = new Map<string, TenantConfig>()
for (const tenant of TENANTS) {
  BY_SLUG.set(tenant.slug.toLowerCase(), tenant)
  for (const alias of tenant.slugAliases ?? []) {
    BY_SLUG.set(alias.toLowerCase(), tenant)
  }
}

export function listTenants(): TenantConfig[] {
  return [...TENANTS]
}

export function listTenantMeta(): TenantPublicMeta[] {
  return TENANTS.map((t) => ({
    slug: t.slug,
    displayName: t.displayName,
    path: `/${t.slug}`,
  }))
}

export function getTenantBySlug(slug: string | undefined | null): TenantConfig | null {
  if (!slug) return null
  return BY_SLUG.get(slug.toLowerCase()) ?? null
}

/** Default tenant when someone hits a bare product URL. */
export const DEFAULT_TENANT_SLUG = delmarDolfinsTenant.slug
