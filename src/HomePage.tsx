import { useEffect } from 'react'
import homeScreenshotDark from './assets/home-screenshot-dark.jpg'
import homeScreenshotLight from './assets/home-screenshot-light.jpg'
import { ShareButton } from './components/ShareButton'
import { useTheme } from './components/ThemeProvider'
import { ThemeToggle } from './components/ThemeToggle'
import { navigate } from './lib/routing'
import {
  PRODUCT_CONTACT_EMAIL,
  PRODUCT_DESCRIPTION,
  PRODUCT_NAME,
} from './product'
import { listTenantMeta } from './tenants'
import './App.css'
import './HomePage.css'

const CONTACT_HREF = `mailto:${PRODUCT_CONTACT_EMAIL}?subject=${encodeURIComponent(
  `${PRODUCT_NAME} — team calendar inquiry`,
)}`

/** Commercial landing for swim teams on Commit. */
export function HomePage() {
  const tenants = listTenantMeta()
  const demoTenant = tenants[0]

  useEffect(() => {
    document.title = `${PRODUCT_NAME} — Practice & meet calendars for Commit teams`
  }, [])

  return (
    <div className="landing">
      <div className="landing__atmosphere" aria-hidden>
        <div className="landing__ripple landing__ripple--a" />
        <div className="landing__ripple landing__ripple--b" />
        <div className="landing__lanes" />
      </div>

      <header className="landing-nav">
        <p className="landing-nav__brand">{PRODUCT_NAME}</p>
        <div className="landing-nav__actions">
          <a className="landing-nav__link" href={CONTACT_HREF}>
            Contact
          </a>
          <ThemeToggle />
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero__copy">
          <h1 className="landing-hero__brand">{PRODUCT_NAME}</h1>
          <p className="landing-hero__headline">
            The mobile calendar your Commit swim team actually opens.
          </p>
          <p className="landing-hero__sub">{PRODUCT_DESCRIPTION}</p>
          <div className="landing-hero__cta">
            <a className="landing-cta landing-cta--primary" href={CONTACT_HREF}>
              Get your team calendar
            </a>
            {demoTenant ? (
              <button
                type="button"
                className="landing-cta landing-cta--ghost"
                onClick={() => navigate(demoTenant.path)}
              >
                See a live schedule
              </button>
            ) : null}
          </div>
        </div>

        <div className="landing-hero__visual" aria-hidden>
          <PhonePreview />
        </div>
      </section>

      <section className="landing-section landing-section--why">
        <h2 className="landing-section__title">Does your swim team use Commit?</h2>
        <p className="landing-section__lede">
          If yes — My Swim Day turns that schedule into a mobile week view coaches and families actually open. No new system to learn.
        </p>
        <ul className="landing-points">
          <li className="landing-point">
            <h3 className="landing-point__title">Pulls from Commit</h3>
            <p className="landing-point__text">
              Practices, meets, and team events stay in sync with your Commit schedule.
            </p>
          </li>
          <li className="landing-point">
            <h3 className="landing-point__title">Mobile-first week view</h3>
            <p className="landing-point__text">
              A phone-optimized calendar parents can check in seconds between carpools.
            </p>
          </li>
          <li className="landing-point">
            <h3 className="landing-point__title">Filter, share, and email</h3>
            <p className="landing-point__text">
              Group filters, one-tap share links, and daily or weekly email digests keep every swimmer’s week clear.
            </p>
          </li>
        </ul>
      </section>

      <section className="landing-section landing-section--teams">
        <h2 className="landing-section__title">Live team calendars</h2>
        <p className="landing-section__lede">
          Open a schedule, or share the link with coaches and families.
        </p>
        <ul className="landing-tenants">
          {tenants.map((tenant) => {
            const teamUrl =
              typeof window !== 'undefined'
                ? `${window.location.origin}${tenant.path}`
                : tenant.path
            return (
              <li key={tenant.slug} className="landing-tenant-row">
                <button
                  type="button"
                  className="landing-tenant"
                  onClick={() => navigate(tenant.path)}
                >
                  <span className="landing-tenant__name">{tenant.displayName}</span>
                  <span className="landing-tenant__hint">Open calendar</span>
                </button>
                <ShareButton
                  className="landing-tenant__share"
                  title={`${tenant.displayName} · ${PRODUCT_NAME}`}
                  text={`Weekly swim schedule for ${tenant.displayName}`}
                  url={teamUrl}
                  label={`Share ${tenant.displayName} schedule link`}
                />
              </li>
            )
          })}
        </ul>
      </section>

      <section className="landing-section landing-section--close">
        <h2 className="landing-section__title">Ready for your team?</h2>
        <p className="landing-section__lede">
          Tell us your Commit team and we’ll set up a mobile calendar your families will use.
        </p>
        <a className="landing-cta landing-cta--primary" href={CONTACT_HREF}>
          Request access
        </a>
      </section>

      <footer className="landing-footer">
        <p>
          {PRODUCT_NAME} · Mobile calendars for{' '}
          <a
            href="https://www.commitswimming.com"
            target="_blank"
            rel="noreferrer"
          >
            Commit Swimming
          </a>{' '}
          teams · myswimday.com
        </p>
      </footer>
    </div>
  )
}

function PhonePreview() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <div className="phone-preview">
      <div className="phone-preview__bezel">
        <img
          className={`phone-preview__screenshot${isDark ? '' : ' is-active'}`}
          src={homeScreenshotLight}
          alt=""
          width={1170}
          height={2532}
          decoding="async"
          aria-hidden={isDark}
        />
        <img
          className={`phone-preview__screenshot phone-preview__screenshot--overlay${
            isDark ? ' is-active' : ''
          }`}
          src={homeScreenshotDark}
          alt=""
          width={1170}
          height={2532}
          decoding="async"
          aria-hidden={!isDark}
        />
      </div>
    </div>
  )
}
