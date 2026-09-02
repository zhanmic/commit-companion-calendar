import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { navigate } from '../lib/routing'
import {
  clearTeamAdminToken,
  getTeamAdminToken,
  hasTeamAdminSession,
  syncTeamAdminFromUrl,
} from '../lib/teamAdmin'
import { PRODUCT_CONTACT_EMAIL } from '../product'
import {
  isBillingSubscribed,
  normalizeBillingStatus,
  type TenantBillingStatus,
} from '../tenants/types'
import { useTenant } from '../tenants/TenantContext'

interface BillingButtonProps {
  className?: string
}

function statusCopy(status: TenantBillingStatus): string {
  switch (status) {
    case 'trialing':
      return 'Pilot in progress — subscribe to stay live after the pilot.'
    case 'past_due':
      return 'Payment issue — update the card or get a new payment link.'
    case 'canceled':
      return 'Subscription canceled. Get a new payment link to resubscribe.'
    case 'active':
      return 'Manage card or cancel in the Stripe customer portal.'
    default:
      return 'This team is not on a paid plan yet.'
  }
}

function statusLabel(status: TenantBillingStatus): string {
  switch (status) {
    case 'active':
      return 'Active'
    case 'trialing':
      return 'Pilot'
    case 'past_due':
      return 'Past due'
    case 'canceled':
      return 'Canceled'
    default:
      return 'Not subscribed'
  }
}

export function BillingButton({ className = '' }: BillingButtonProps) {
  const tenant = useTenant()
  const [teamAdmin, setTeamAdmin] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const status = normalizeBillingStatus(tenant.billingStatus)
  const subscribed = isBillingSubscribed(status)
  const hasCustomer = Boolean(tenant.stripeCustomerId)
  const showManage = subscribed || status === 'past_due'
  const showPay =
    !subscribed || status === 'past_due' || status === 'trialing'

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await syncTeamAdminFromUrl(tenant.slug)
      if (cancelled) return
      setTeamAdmin(result.active)
      setUnlockError(result.error)
      if (result.active && result.error === null) {
        const params = new URLSearchParams(window.location.search)
        if (params.get('billing') === 'success') {
          setOpen(true)
          setMessage('Payment completed — status updates after operator confirms.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tenant.slug])

  useEffect(() => {
    if (!open) return
    setMessage(null)
    setError(null)
    setCheckoutUrl(null)
  }, [open])

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!teamAdmin) {
    if (unlockError) {
      return (
        <p className="billing-unlock-error" role="status">
          {unlockError}
        </p>
      )
    }
    return null
  }

  function leaveTeamAdmin() {
    clearTeamAdminToken(tenant.slug)
    setTeamAdmin(false)
    setOpen(false)
  }

  async function billingFetch(
    path: string,
    body: Record<string, unknown>,
  ): Promise<
    { ok: true; data: Record<string, unknown> } | { ok: false; error: string }
  > {
    const token = getTeamAdminToken(tenant.slug)
    if (!token) {
      return { ok: false, error: 'Team admin session expired. Re-open your link.' }
    }
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Team-Admin': token,
        },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >
      if (!res.ok) {
        return {
          ok: false,
          error:
            typeof data.error === 'string'
              ? data.error
              : `Request failed (${res.status})`,
        }
      }
      return { ok: true, data }
    } catch {
      return { ok: false, error: 'Network error — try again.' }
    }
  }

  async function onGetPaymentLink(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    setCheckoutUrl(null)

    const result = await billingFetch('/api/billing/checkout', {
      tenantSlug: tenant.slug,
      customerEmail: email.trim() || undefined,
      interval: 'month',
      successUrl: `${window.location.origin}/${tenant.slug}?billing=success`,
      cancelUrl: `${window.location.origin}/${tenant.slug}?billing=cancel`,
    })

    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }

    const url = typeof result.data.url === 'string' ? result.data.url : ''
    if (!url) {
      setError('Checkout created but no URL returned.')
      return
    }
    setCheckoutUrl(url)
    setMessage('Payment link ready.')
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function onManageBilling() {
    setBusy(true)
    setError(null)
    setMessage(null)

    const result = await billingFetch('/api/billing/portal', {
      tenantSlug: tenant.slug,
      returnUrl: `${window.location.origin}/${tenant.slug}`,
    })

    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }

    const url = typeof result.data.url === 'string' ? result.data.url : ''
    if (!url) {
      setError('Portal session created but no URL returned.')
      return
    }
    setMessage('Opening billing portal…')
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function copyCheckoutUrl() {
    if (!checkoutUrl) return
    try {
      await navigator.clipboard.writeText(checkoutUrl)
      setMessage('Payment link copied.')
    } catch {
      setError('Could not copy — select the link manually.')
    }
  }

  const contactHref = `mailto:${PRODUCT_CONTACT_EMAIL}?subject=${encodeURIComponent(
    `Billing — ${tenant.displayName}`,
  )}`

  return (
    <div
      className={`billing${className ? ` ${className}` : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className={`billing__button${subscribed ? ' billing__button--active' : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Team billing"
        title="Team billing"
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          className="billing__icon"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <rect
            x="3"
            y="6"
            width="18"
            height="12"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.75"
          />
          <path
            d="M3 10h18"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M7 15h4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
        <span
          className={`billing__dot${subscribed ? ' billing__dot--on' : ''}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="billing__panel" id={panelId} role="dialog">
          <p className="billing__heading">Team subscription</p>
          <p className="billing__status">
            <span
              className={`billing__badge${
                subscribed
                  ? ' billing__badge--on'
                  : status === 'past_due'
                    ? ' billing__badge--warn'
                    : ''
              }`}
            >
              {statusLabel(status)}
            </span>
          </p>
          <p className="billing__copy">{statusCopy(status)}</p>

          <div className="billing__key-row">
            <span className="billing__hint">
              Team admin
              {hasTeamAdminSession(tenant.slug) ? ' · this browser' : ''}
            </span>
            <button
              type="button"
              className="billing__text-btn"
              onClick={leaveTeamAdmin}
            >
              Sign out
            </button>
          </div>

          {showPay ? (
            <form className="billing__form" onSubmit={onGetPaymentLink}>
              <label className="billing__field">
                <span className="billing__field-label">
                  Receipt email (optional)
                </span>
                <input
                  className="billing__input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="coach@example.com"
                  disabled={busy}
                />
              </label>
              <button
                type="submit"
                className="billing__submit"
                disabled={busy}
              >
                {busy ? 'Working…' : 'Get payment link'}
              </button>
            </form>
          ) : null}

          {showManage ? (
            <div className="billing__actions">
              <button
                type="button"
                className={`billing__submit${showPay ? ' billing__submit--secondary' : ''}`}
                disabled={busy || (!hasCustomer && subscribed)}
                onClick={() => void onManageBilling()}
              >
                {busy ? 'Working…' : 'Manage billing'}
              </button>
              {subscribed && !hasCustomer ? (
                <p className="billing__hint">
                  Billing portal unlocks after My Swim Day confirms your
                  payment.
                </p>
              ) : null}
            </div>
          ) : null}

          {checkoutUrl ? (
            <div className="billing__link-box">
              <p className="billing__hint">Stripe Checkout</p>
              <a
                className="billing__link"
                href={checkoutUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open payment page
              </a>
              <button
                type="button"
                className="billing__text-btn"
                onClick={() => void copyCheckoutUrl()}
              >
                Copy link
              </button>
            </div>
          ) : null}

          <nav className="billing__footer" aria-label="Policy">
            <button
              type="button"
              className="billing__text-btn"
              onClick={() => navigate('/service')}
            >
              Service
            </button>
            <span aria-hidden>·</span>
            <button
              type="button"
              className="billing__text-btn"
              onClick={() => navigate('/terms')}
            >
              Terms
            </button>
            <span aria-hidden>·</span>
            <button
              type="button"
              className="billing__text-btn"
              onClick={() => navigate('/support')}
            >
              Support
            </button>
            <span aria-hidden>·</span>
            <a className="billing__text-btn" href={contactHref}>
              Contact
            </a>
          </nav>

          {message ? (
            <p className="billing__feedback" role="status">
              {message}
            </p>
          ) : null}
          {error ? (
            <p
              className="billing__feedback billing__feedback--error"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
