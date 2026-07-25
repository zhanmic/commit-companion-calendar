import { useEffect, useState } from 'react'
import { HomePage } from './HomePage'
import { NotFoundPage } from './NotFoundPage'
import { TenantSchedule } from './TenantSchedule'
import { parsePath, type AppRoute } from './lib/routing'
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

  if (route.kind === 'home') {
    return <HomePage />
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
