import { useEffect, useId, useRef } from 'react'
import { EVENT_COLOR, MEET_COLOR, colorForGroup } from '../lib/groups'
import { PRODUCT_NAME } from '../product'
import { useTenant } from '../tenants/TenantContext'
import { formatTimeRange } from '../lib/week'
import type { Occurrence } from '../types'
import type { CSSProperties } from 'react'
import { AddToCalendarButton } from './AddToCalendarButton'
import { SessionKindIcon } from './SessionKindIcon'

interface Props {
  title: string
  subtitle?: string
  occurrences: Occurrence[]
  onClose: () => void
}

export function DayDetailSheet({
  title,
  subtitle,
  occurrences,
  onClose,
}: Props) {
  const tenant = useTenant()
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <div className="day-sheet" role="presentation">
      <button
        type="button"
        className="day-sheet__backdrop"
        aria-label="Close day details"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="day-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="day-sheet__header">
          <div className="day-sheet__heading">
            <h2 id={titleId} className="day-sheet__title">
              {title}
            </h2>
            {subtitle ? (
              <p className="day-sheet__subtitle">{subtitle}</p>
            ) : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="day-sheet__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="day-sheet__body">
          {occurrences.map((occ) => {
            const kind =
              occ.label === 'meet'
                ? 'meet'
                : occ.label === 'event'
                  ? 'event'
                  : 'practice'
            const team = occ.subTeams[0]
            const accent =
              kind === 'meet'
                ? MEET_COLOR
                : kind === 'event'
                  ? EVENT_COLOR
                  : colorForGroup(tenant, team)
            return (
              <article
                key={occ.id}
                className={`day-sheet__card day-sheet__card--${kind}`}
                style={
                  {
                    '--card-accent': accent,
                  } as CSSProperties
                }
              >
                <div className="day-sheet__card-top">
                  <div className="day-sheet__card-meta">
                    <SessionKindIcon kind={kind} className="day-sheet__badge" />
                    <span className="day-sheet__card-time">
                      {formatTimeRange(occ.start, occ.end)}
                    </span>
                  </div>
                  <AddToCalendarButton
                    occurrences={[occ]}
                    compact
                    label="Add to Calendar"
                    calendarName={`${tenant.displayName} Schedule`}
                    calendarOptions={{
                      sourceLabel: `${tenant.displayName} · ${PRODUCT_NAME}`,
                      filenamePrefix: tenant.icsFilenamePrefix,
                    }}
                    className="day-sheet__cal"
                  />
                </div>
                <h3 className="day-sheet__card-title">{occ.name}</h3>
                <dl className="day-sheet__fields">
                  {occ.fields.map((field) => (
                    <div key={`${occ.id}-${field.label}`} className="day-sheet__field">
                      <dt>{field.label}</dt>
                      <dd>{field.value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
