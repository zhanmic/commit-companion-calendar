import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { groupOrder } from '../lib/groups'
import { useTenant } from '../tenants/TenantContext'

type Frequency = 'daily' | 'weekly'

interface SubscribeButtonProps {
  className?: string
  /** Prefill from the on-page group filter. */
  selectedGroups: Set<string>
  showEvents: boolean
  showMeets: boolean
}

export function SubscribeButton({
  className = '',
  selectedGroups,
  showEvents,
  showMeets,
}: SubscribeButtonProps) {
  const tenant = useTenant()
  const groups = groupOrder(tenant)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('weekly')
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selectedGroups))
  const [includeEvents, setIncludeEvents] = useState(showEvents)
  const [includeMeets, setIncludeMeets] = useState(showMeets)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    setPicked(new Set(selectedGroups))
    setIncludeEvents(showEvents)
    setIncludeMeets(showMeets)
    setMessage(null)
    setError(null)
  }, [open, selectedGroups, showEvents, showMeets])

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

  function toggleGroup(team: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(team)) next.delete(team)
      else next.add(team)
      return next
    })
  }

  function selectAll() {
    setPicked(new Set(groups))
  }

  function clearGroups() {
    setPicked(new Set())
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    setError(null)

    const groupsPayload =
      picked.size === 0 || picked.size === groups.length
        ? []
        : groups.filter((g) => picked.has(g))

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          tenantSlug: tenant.slug,
          frequency,
          groups: groupsPayload,
          includeEvents,
          includeMeets,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        message?: string
        error?: string
      }
      if (!res.ok) {
        setError(data.error || 'Could not subscribe')
        return
      }
      setMessage(data.message || 'Check your email to confirm.')
    } catch {
      setError('Network error — try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      ref={rootRef}
      className={`subscribe${className ? ` ${className}` : ''}`}
    >
      <button
        type="button"
        className="subscribe__button"
        aria-label="Email schedule"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        title="Email schedule"
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="subscribe__icon"
          aria-hidden
        >
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      </button>

      {open ? (
        <form
          id={panelId}
          className="subscribe__panel"
          role="dialog"
          aria-label="Email schedule subscription"
          onSubmit={(e) => void onSubmit(e)}
        >
          <p className="subscribe__heading">Email schedule</p>
          <p className="subscribe__hint">
            Get a {frequency} digest for {tenant.displayName}. Confirm via email
            before anything is sent.
          </p>

          <label className="subscribe__field">
            <span className="subscribe__field-label">Email</span>
            <input
              type="email"
              className="subscribe__input"
              value={email}
              required
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <p className="subscribe__field-label">Frequency</p>
          <div
            className="subscribe__freq"
            role="radiogroup"
            aria-label="Email frequency"
          >
            {(
              [
                { value: 'weekly', label: 'Weekly', hint: 'Sunday evening' },
                { value: 'daily', label: 'Daily', hint: 'Each morning' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={frequency === option.value}
                className={`subscribe__choice${
                  frequency === option.value ? ' subscribe__choice--active' : ''
                }`}
                onClick={() => setFrequency(option.value)}
              >
                <span className="subscribe__choice-label">{option.label}</span>
                <span className="subscribe__choice-hint">{option.hint}</span>
              </button>
            ))}
          </div>

          <div className="subscribe__groups-head">
            <p className="subscribe__field-label">Groups</p>
            <div className="subscribe__group-actions">
              <button type="button" className="subscribe__text-btn" onClick={selectAll}>
                All
              </button>
              <button type="button" className="subscribe__text-btn" onClick={clearGroups}>
                Clear
              </button>
            </div>
          </div>
          <p className="subscribe__hint">
            Empty or all = every group. Prefills from your current filters.
          </p>
          <div
            className="subscribe__groups"
            role="group"
            aria-label="Practice groups"
          >
            {groups.map((team) => {
              const active = picked.has(team)
              return (
                <button
                  key={team}
                  type="button"
                  className={`subscribe__group-chip${
                    active ? ' subscribe__group-chip--active' : ''
                  }`}
                  aria-pressed={active}
                  onClick={() => toggleGroup(team)}
                >
                  {team}
                </button>
              )
            })}
          </div>

          <div
            className="subscribe__groups"
            role="group"
            aria-label="Include events and meets"
          >
            <button
              type="button"
              className={`subscribe__group-chip${
                includeEvents ? ' subscribe__group-chip--active' : ''
              }`}
              aria-pressed={includeEvents}
              onClick={() => setIncludeEvents((v) => !v)}
            >
              Event
            </button>
            <button
              type="button"
              className={`subscribe__group-chip${
                includeMeets ? ' subscribe__group-chip--active' : ''
              }`}
              aria-pressed={includeMeets}
              onClick={() => setIncludeMeets((v) => !v)}
            >
              Meet
            </button>
          </div>

          <button
            type="submit"
            className="subscribe__submit"
            disabled={submitting}
          >
            {submitting ? 'Sending…' : 'Subscribe'}
          </button>

          {message ? (
            <p className="subscribe__status" role="status">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="subscribe__status subscribe__status--error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  )
}
