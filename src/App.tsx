import { useEffect, useState } from 'react'
import { HomePage } from './HomePage'
import { NotFoundPage } from './NotFoundPage'
import { TenantSchedule } from './TenantSchedule'
import { LEGAL_DOCUMENTS } from './legal/content'
import { LegalPage } from './legal/LegalPage'
import { currentPath, parsePath, type AppRoute } from './lib/routing'
import { getTenantBySlug } from './tenants'
import { TenantProvider } from './tenants/TenantContext'

function readRoute(): AppRoute {
  return parsePath(window.location.pathname)
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(readRoute)

  useEffect(() => {
    function onPopState() {
      setRoute(readRoute())
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (route.kind !== 'tenant') return
    const tenant = getTenantBySlug(route.slug)
    if (!tenant) return
    // Canonicalize typo / alias paths (e.g. /DelmarDolphins → /DelmarDolfins).
    if (route.slug.toLowerCase() === tenant.slug.toLowerCase()) return
    const canonical = `/${tenant.slug}${window.location.search}`
    if (currentPath() === canonical) return
    window.history.replaceState({}, '', canonical)
    setRoute(readRoute())
  }, [route])

  useEffect(() => {
    if (route.kind !== 'legal') return
    const doc = LEGAL_DOCUMENTS[route.page]
    if (!doc) return
    document.title = `${doc.title} · My Swim Day`
  }, [route])

  if (route.kind === 'home') {
    return <HomePage />
  }

  if (route.kind === 'legal') {
    const doc = LEGAL_DOCUMENTS[route.page]
    if (!doc) return <NotFoundPage path={`/${route.page}`} />
    return <LegalPage doc={doc} activeSlug={route.page} />
  }

  if (route.kind === 'tenant') {
    const tenant = getTenantBySlug(route.slug)
    if (!tenant) return <NotFoundPage path={`/${route.slug}`} />
    return (
      <TenantProvider tenant={tenant}>
        <TenantSchedule />
      </TenantProvider>
    )
  }

  return <NotFoundPage path={route.path} />
}
