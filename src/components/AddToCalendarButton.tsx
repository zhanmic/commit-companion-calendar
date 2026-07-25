import { useEffect, useState, type MouseEvent } from 'react'
import { offerCalendarFile, type OfferCalendarOptions } from '../lib/calendar'
import type { Occurrence } from '../types'

interface Props {
  occurrences: Occurrence[]
  /** Visible label; defaults based on count. */
  label?: string
  /** Compact icon+text for day-sheet cards. */
  compact?: boolean
  className?: string
  /** Optional calendar display name inside the .ics file. */
  calendarName?: string
  /** Extra ICS options (timezone, source label, filename prefix). */
  calendarOptions?: Omit<OfferCalendarOptions, 'calendarName'>
}

export function AddToCalendarButton({
  occurrences,
  label,
  compact = false,
  className = '',
  calendarName,
  calendarOptions,
}: Props) {
  const [status, setStatus] = useState<string | null>(null)
  const disabled = occurrences.length === 0
  const defaultLabel = 'Add to Calendar'
  const buttonLabel = label ?? defaultLabel

  useEffect(() => {
    if (!status) return
    const id = window.setTimeout(() => setStatus(null), 2200)
    return () => window.clearTimeout(id)
  }, [status])

  async function onClick(event: MouseEvent<HTMLButtonElement>) {
    // Day cards sit inside a clickable day row — don't open the sheet again.
    event.stopPropagation()
    if (disabled) return

    const result = await offerCalendarFile(occurrences, {
      ...calendarOptions,
      calendarName,
    })
    if (result === 'opened') setStatus('Opening Calendar…')
    else if (result === 'downloaded') setStatus('Opening Calendar…')
    else if (result === 'empty') setStatus('Nothing to add')
  }

  return (
    <div
      className={`cal-btn-wrap${compact ? ' cal-btn-wrap--compact' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      <button
        type="button"
        className={`cal-btn${compact ? ' cal-btn--compact' : ''}`}
        disabled={disabled}
        aria-label={buttonLabel}
        title={buttonLabel}
        onClick={(event) => {
          void onClick(event)
        }}
      >
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
          <path d="M12 14v4" />
          <path d="M10 16h4" />
        </svg>
        <span className="cal-btn__label">{buttonLabel}</span>
      </button>
      {status ? (
        <span className="cal-btn__toast" role="status" aria-live="polite">
          {status}
        </span>
      ) : null}
    </div>
  )
}
