import { navigate } from './lib/routing'
import { PRODUCT_NAME } from './product'
import './App.css'

export function NotFoundPage({ path }: { path: string }) {
  return (
    <div className="app home">
      <div className="app__glow" aria-hidden />
      <header className="hero">
        <h1 className="hero__brand">{PRODUCT_NAME}</h1>
        <p className="hero__sub">No schedule found for {path}</p>
      </header>
      <main className="panel">
        <div className="state">
          <button type="button" className="text-btn" onClick={() => navigate('/')}>
            Back to teams
          </button>
        </div>
      </main>
    </div>
  )
}
