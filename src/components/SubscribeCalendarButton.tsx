import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { isAppleTouchDevice } from '../lib/calendar'
import {
  calendarFeedHttpsUrl,
  calendarFeedWebcalUrl,
  canSubscribeCalendar,
  publicFeedOrigin,
  type CalendarFeedQuery,
} from '../lib/calendarFeed'

interface Props {
  query: CalendarFeedQuery
  /** Calendar name in iPhone Calendar (team name only). */
  calendarName: string
  /** Groups/meets included from the current website filters. */
  includesLabel?: string
  className?: string
  /** Hero slot (replaces Carpool): pill trigger that matches the header. */
  variant?: 'filters' | 'hero'
}

export function SubscribeCalendarButton({
  query,
  calendarName,
  includesLabel = '',
  className = '',
  variant = 'filters',
}: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const panelId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const origin = publicFeedOrigin(
    typeof window !== 'undefined' ? window.location.origin : 'https://myswimday.com',
  )
  const httpsUrl = calendarFeedHttpsUrl(origin, query)
  const webcalUrl = calendarFeedWebcalUrl(origin, query)
  const enabled = canSubscribeCalendar(query)
  const apple = isAppleTouchDevice()

  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), 2200)
    return () => window.clearTimeout(id)
  }, [copied])

  async function copyLink(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    try {
      await navigator.clipboard.writeText(httpsUrl)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const hero = variant === 'hero'

  return (
    <div
      ref={wrapRef}
      className={`cal-btn-wrap cal-subscribe${hero ? ' cal-subscribe--hero' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      <button
        type="button"
        className={hero ? 'hero__carpool' : 'cal-btn'}
        disabled={!enabled}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Sync to iPhone Calendar"
        title="Subscribe in iPhone Calendar so times stay up to date"
        onClick={(event) => {
          event.stopPropagation()
          if (!enabled) return
          setOpen((value) => !value)
        }}
      >
        {hero ? null : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="cal-btn__icon"
            aria-hidden
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4" />
            <path d="M8 2v4" />
            <path d="M3 10h18" />
            <path d="M8 14h.01" />
            <path d="M12 14h.01" />
            <path d="M16 14h.01" />
            <path d="M8 18h8" />
          </svg>
        )}
        <span className={hero ? undefined : 'cal-btn__label'}>Sync to iPhone</span>
      </button>

      {open ? (
        <div
          id={panelId}
          className="cal-subscribe__panel"
          role="dialog"
          aria-label="Subscribe in iPhone Calendar"
        >
          <p className="cal-subscribe__title">{calendarName}</p>
          {includesLabel ? (
            <p className="cal-subscribe__includes">Includes {includesLabel}.</p>
          ) : null}
          <p className="cal-subscribe__lead">
            iPhone Calendar shows this as one calendar with one color. It cannot
            copy the website group chips. Each event title still names the group
            (Sr Practice, Jr Practice).
          </p>
          <p className="cal-subscribe__lead">
            The phone re-downloads this link on its own (often every few hours).
            My Swim Day does not push to the phone.
          </p>
          {apple ? (
            <a className="cal-subscribe__primary" href={webcalUrl}>
              Add to iPhone Calendar
            </a>
          ) : (
            <a className="cal-subscribe__primary" href={webcalUrl}>
              Open in Calendar
            </a>
          )}
          <p className="cal-subscribe__or">
            Or on the iPhone: Calendar → Calendars → Add Calendar → Add
            Subscription Calendar, then paste:
          </p>
          <div className="cal-subscribe__copy-row">
            <textarea
              className="cal-subscribe__url"
              readOnly
              rows={3}
              value={httpsUrl}
              aria-label="Subscription URL"
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              type="button"
              className="cal-subscribe__copy"
              onClick={(event) => {
                void copyLink(event)
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
