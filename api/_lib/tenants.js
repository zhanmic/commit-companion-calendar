/**
 * Server tenant registry for public catalog + email digests.
 * Keep slug/displayName in sync with `src/tenants/registry.ts`.
 * Digest fields (groups, parsers, Commit id) live here for serverless jobs.
 */

export const TENANTS = [
  {
    slug: 'DelmarDolfins',
    displayName: 'Delmar Dolfins',
    path: '/DelmarDolfins',
    slugAliases: ['DelmarDolphins', 'DelmaDolphins'],
    superTeamId: 'g8g7f3rkF8N23vXs4',
    /** IANA zone — digests fire at dailySendHour / weeklySendHour in this zone. */
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
    /**
     * Team admin unlock token — share as /DelmarDolfins?ta=<token>
     * Server-only; never put this in the frontend tenant module.
     */
    teamAdminToken: '042b6989b7476c6a5424ae6506db389b',
  },
  {
    slug: 'VortexSwimClub',
    displayName: 'Vortex Swim Club',
    path: '/VortexSwimClub',
    slugAliases: ['TeamVortex', 'Vortex'],
    superTeamId: 'WNP4xfPJL67a6k2Np',
    defaultTimeZone: 'America/Denver',
    groups: [
      { id: 'Peak', label: 'Peak' },
      { id: 'Elite', label: 'Elite' },
      { id: 'Prep', label: 'Prep' },
      { id: 'Age Group', label: 'Age Group' },
      { id: 'Storm', label: 'Storm' },
      { id: 'Cyclone', label: 'Cyclone' },
      { id: 'Hail', label: 'Hail' },
      { id: 'Lightning', label: 'Lightning' },
      { id: 'Thunder', label: 'Thunder' },
      { id: 'Other', label: 'Other' },
    ],
    defaultGroups: [
      'Peak',
      'Elite',
      'Prep',
      'Age Group',
      'Storm',
      'Cyclone',
      'Hail',
      'Lightning',
      'Thunder',
    ],
    practiceNameFormat: {
      mode: 'keywords',
      separator: '-',
      fields: ['group', 'location', 'time'],
    },
    dailySendHour: 7,
    weeklySendHour: 18,
    teamAdminToken: '34909442fbb8f8a6bbb243ca6087a3a6',
  },
]

export function listTenants() {
  return TENANTS.map((t) => ({
    slug: t.slug,
    displayName: t.displayName,
    path: t.path,
    slugAliases: t.slugAliases ? [...t.slugAliases] : undefined,
    billingStatus: t.billingStatus || 'none',
    hasCustomer: Boolean(t.stripeCustomerId),
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
