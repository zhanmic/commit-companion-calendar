import { LEGAL_PAGES, type LegalSlug } from './legalMeta'
import { navigate } from '../lib/routing'
import { PRODUCT_NAME } from '../product'
import type { LegalDocument } from './content'
import './LegalPage.css'

type LegalPageProps = {
  doc: LegalDocument
  activeSlug: LegalSlug
}

export function LegalPage({ doc, activeSlug }: LegalPageProps) {
  return (
    <div className="legal">
      <div className="legal__atmosphere" aria-hidden />
      <header className="legal-nav">
        <button
          type="button"
          className="legal-nav__brand"
          onClick={() => navigate('/')}
        >
          {PRODUCT_NAME}
        </button>
        <nav className="legal-nav__links" aria-label="Policy pages">
          {LEGAL_PAGES.map((page) => (
            <button
              key={page.slug}
              type="button"
              className={
                page.slug === activeSlug
                  ? 'legal-nav__link is-active'
                  : 'legal-nav__link'
              }
              onClick={() => navigate(page.path)}
            >
              {page.label}
            </button>
          ))}
        </nav>
      </header>

      <article className="legal-doc">
        <h1 className="legal-doc__title">{doc.title}</h1>
        <p className="legal-doc__lede">{doc.lede}</p>

        {doc.sections.map((section) => (
          <section key={section.id} id={section.id} className="legal-section">
            <h2 className="legal-section__title">{section.title}</h2>
            {section.paragraphs?.map((p, i) => (
              <p key={`${section.id}-p-${i}`} className="legal-section__p">
                {p}
              </p>
            ))}
            {section.bullets ? (
              <ul className="legal-section__list">
                {section.bullets.map((item, i) => (
                  <li key={`${section.id}-b-${i}`}>{item}</li>
                ))}
              </ul>
            ) : null}
            {section.subsections?.map((sub, si) => (
              <div key={`${section.id}-sub-${si}`} className="legal-subsection">
                <h3 className="legal-subsection__title">{sub.title}</h3>
                {sub.paragraphs?.map((p, i) => (
                  <p key={`${section.id}-sub-${si}-p-${i}`} className="legal-section__p">
                    {p}
                  </p>
                ))}
                {sub.bullets ? (
                  <ul className="legal-section__list">
                    {sub.bullets.map((item, i) => (
                      <li key={`${section.id}-sub-${si}-b-${i}`}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </section>
        ))}
      </article>

      <LegalFooter />
    </div>
  )
}

/** Compact footer links for landing and tenant chrome. */
export function LegalFooter({ className = '' }: { className?: string }) {
  return (
    <nav
      className={`legal-footer-links${className ? ` ${className}` : ''}`}
      aria-label="Legal"
    >
      {LEGAL_PAGES.map((page, i) => (
        <span key={page.slug} className="legal-footer-links__item">
          {i > 0 ? <span aria-hidden>·</span> : null}
          <button
            type="button"
            className="legal-footer-links__btn"
            onClick={() => navigate(page.path)}
          >
            {page.label}
          </button>
        </span>
      ))}
    </nav>
  )
}
