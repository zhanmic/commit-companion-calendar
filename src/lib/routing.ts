import { getTenantBySlug } from '../tenants/registry'

export type AppRoute =
  | { kind: 'home' }
  | { kind: 'tenant'; slug: string }
  | { kind: 'notFound'; path: string }

/** Parse the browser path into a product or tenant route. */
export function parsePath(pathname: string): AppRoute {
  const clean = pathname.replace(/\/+$/, '') || '/'
  if (clean === '/') return { kind: 'home' }

  const segments = clean.split('/').filter(Boolean)
  if (segments.length === 1) {
    const slug = segments[0]
    if (getTenantBySlug(slug)) return { kind: 'tenant', slug }
  }

  return { kind: 'notFound', path: clean }
}

export function currentPath(): string {
  return window.location.pathname + window.location.search
}

export function navigate(path: string): void {
  if (currentPath() === path) return
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function replaceLocation(path: string): void {
  if (currentPath() === path) return
  window.history.replaceState({}, '', path)
}
