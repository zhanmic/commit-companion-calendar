import { useEffect } from 'react'
import { navigate } from './lib/routing'
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from './product'
import { listTenantMeta } from './tenants'
import './App.css'

/** Product landing — pick a tenant schedule. */
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
        <ul className="home__tenants">
          {tenants.map((tenant) => (
            <li key={tenant.slug}>
              <button
                type="button"
                className="home__tenant"
                onClick={() => navigate(tenant.path)}
              >
                <span className="home__tenant-name">{tenant.displayName}</span>
                <span className="home__tenant-path">{tenant.path}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="home__hint">
          New tenants register under <code>src/tenants/</code> with their own
          Commit team id and practice/meet parsers.
        </p>
      </main>
    </div>
  )
}
