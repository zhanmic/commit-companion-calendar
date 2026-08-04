/**
 * Server tenant registry for public catalog + email digests.
 * Keep slug/displayName in sync with `src/tenants/registry.ts`.
 * Digest fields (groups, parsers, Commit id) live here for serverless jobs.
 */

export const TENANTS = [
  {
    slug: 'DelmarDolphins',
    displayName: 'Delmar Dolphins',
    path: '/DelmarDolphins',
    slugAliases: ['DelmaDolphins'],
    superTeamId: 'g8g7f3rkF8N23vXs4',
    defaultTimeZone: 'America/New_York',
    /** Filter chips offered on subscribe (tenant-customized). */
    groups: [
      { id: 'Sr', label: 'Sr' },
      { id: 'Jr', label: 'Jr' },
      { id: 'Jr Prep', label: 'Jr Prep' },
      { id: 'DEVO', label: 'DEVO' },
      { id: 'Sr/Jr', label: 'Sr/Jr' },
      { id: 'Other', label: 'Other' },
    ],
    defaultGroups: ['Sr'],
    practiceNameFormat: {
      mode: 'fields',
      separator: '-',
      fields: ['group', 'location', 'time'],
    },
    /** Local hour (0–23) to send daily digests. */
    dailySendHour: 7,
    /** Local hour on Sunday to send weekly digests. */
    weeklySendHour: 18,
  },
]

export function listTenants() {
  return TENANTS.map((t) => ({
    slug: t.slug,
    displayName: t.displayName,
    path: t.path,
    slugAliases: t.slugAliases ? [...t.slugAliases] : undefined,
  }))
}

export function getTenantBySlug(slug) {
  if (!slug || typeof slug !== 'string') return null
  const key = slug.toLowerCase()
  return (
    TENANTS.find(
      (t) =>
        t.slug.toLowerCase() === key ||
        (t.slugAliases ?? []).some((alias) => alias.toLowerCase() === key),
    ) ?? null
  )
}

export function listDigestTenants() {
  return TENANTS.filter((t) => t.superTeamId)
}

export function groupIds(tenant) {
  return (tenant.groups ?? []).map((g) => g.id)
}
