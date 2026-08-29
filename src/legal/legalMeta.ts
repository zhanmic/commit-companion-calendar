/** Routes and labels for public legal / policy pages. */

export const LEGAL_PAGES = [
  { slug: 'service', path: '/service', label: 'Service' },
  { slug: 'support', path: '/support', label: 'Support' },
  { slug: 'terms', path: '/terms', label: 'Terms' },
  { slug: 'privacy', path: '/privacy', label: 'Privacy' },
] as const

export type LegalSlug = (typeof LEGAL_PAGES)[number]['slug']

export const LEGAL_SLUGS = new Set<string>(LEGAL_PAGES.map((p) => p.slug))

export function isLegalSlug(value: string): value is LegalSlug {
  return LEGAL_SLUGS.has(value)
}

/** Effective date shown on all policy pages. */
export const LEGAL_EFFECTIVE_DATE = 'August 29, 2026'
