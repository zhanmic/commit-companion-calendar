import { delmaDolphinsTenant } from './DelmaDolphins'
import type { TenantConfig, TenantPublicMeta } from './types'

/**
 * Register new tenants here.
 * Each tenant owns its Commit team id and practice/meet parsers.
 */
const TENANTS: TenantConfig[] = [delmaDolphinsTenant]

const BY_SLUG = new Map(TENANTS.map((t) => [t.slug.toLowerCase(), t]))

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
export const DEFAULT_TENANT_SLUG = delmaDolphinsTenant.slug
