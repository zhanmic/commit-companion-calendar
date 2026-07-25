import { useEffect } from 'react'
import { ShareButton } from './components/ShareButton'
import { navigate } from './lib/routing'
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from './product'
import { listTenantMeta } from './tenants'
import './App.css'

/** Product landing — pick a team schedule. */
export function HomePage() {
  const tenants = listTenantMeta()

  useEffect(() => {
    document.title = PRODUCT_NAME
  }, [])

  return (
    <div className="app home">
      <div className="app__glow" aria-hidden />
      <header className="hero">
        <h1 className="hero__brand home__brand">{PRODUCT_NAME}</h1>
        <p className="hero__sub">{PRODUCT_DESCRIPTION}</p>
      </header>

      <main className="panel home__panel">
        <h2 className="home__heading">Teams</h2>
        <p className="home__section-sub">
          Open your team’s schedule, or share the link with coaches and families.
        </p>
        <ul className="home__tenants">
          {tenants.map((tenant) => {
            const teamUrl =
              typeof window !== 'undefined'
                ? `${window.location.origin}${tenant.path}`
                : tenant.path
            return (
              <li key={tenant.slug} className="home__tenant-row">
                <button
                  type="button"
                  className="home__tenant"
                  onClick={() => navigate(tenant.path)}
                >
                  <span className="home__tenant-name">{tenant.displayName}</span>
                </button>
                <ShareButton
                  className="home__tenant-share"
                  title={`${tenant.displayName} · ${PRODUCT_NAME}`}
                  text={`Weekly swim schedule for ${tenant.displayName}`}
                  url={teamUrl}
                  label={`Share ${tenant.displayName} schedule link`}
                />
              </li>
            )
          })}
        </ul>
      </main>
    </div>
  )
}
