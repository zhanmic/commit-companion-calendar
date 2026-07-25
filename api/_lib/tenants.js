/**
 * Public tenant registry for serverless routes.
 * Keep in sync with `src/tenants/registry.ts` (slug + displayName).
 * Parsers and Commit IDs stay in the frontend tenant modules.
 */
export const TENANTS = [
  {
    slug: 'DelmaDolphins',
    displayName: 'Delma Dolphins',
    path: '/DelmaDolphins',
  },
]

export function listTenants() {
  return TENANTS.map((t) => ({ ...t }))
}

export function getTenantBySlug(slug) {
  if (!slug || typeof slug !== 'string') return null
  const key = slug.toLowerCase()
  return TENANTS.find((t) => t.slug.toLowerCase() === key) ?? null
}
