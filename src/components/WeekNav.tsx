import type { ScheduleView } from '../lib/month'

interface Props {
  label: string
  view: ScheduleView
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onToggleView: () => void
}

/** Calendar page with hanging rings and a 4×3 day grid — “go to month”. */
function MonthGridIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden>
      <rect x="5.25" y="1.2" width="1.9" height="3.6" rx="0.95" fill="currentColor" />
      <rect x="12.85" y="1.2" width="1.9" height="3.6" rx="0.95" fill="currentColor" />
      <rect
        x="2.25"
        y="3.4"
        width="15.5"
        height="14.4"
        rx="2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M2.25 7.15h15.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <g fill="currentColor">
        <rect x="4.35" y="8.7" width="2" height="2" rx="0.45" />
        <rect x="7.35" y="8.7" width="2" height="2" rx="0.45" />
        <rect x="10.35" y="8.7" width="2" height="2" rx="0.45" />
        <rect x="13.35" y="8.7" width="2" height="2" rx="0.45" />
        <rect x="4.35" y="11.55" width="2" height="2" rx="0.45" />
        <rect x="7.35" y="11.55" width="2" height="2" rx="0.45" />
        <rect x="10.35" y="11.55" width="2" height="2" rx="0.45" />
        <rect x="13.35" y="11.55" width="2" height="2" rx="0.45" />
        <rect x="4.35" y="14.4" width="2" height="2" rx="0.45" />
        <rect x="7.35" y="14.4" width="2" height="2" rx="0.45" />
        <rect x="10.35" y="14.4" width="2" height="2" rx="0.45" />
      </g>
    </svg>
  )
}

/** Stacked day rows — “go to week” (agenda / week list). */
function WeekStripIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden>
      <g fill="currentColor">
        <rect x="2.2" y="3.2" width="3.1" height="3.1" rx="0.85" />
        <rect x="6.4" y="3.7" width="11.4" height="2.1" rx="1.05" />
        <rect x="2.2" y="8.45" width="3.1" height="3.1" rx="0.85" />
        <rect x="6.4" y="8.95" width="11.4" height="2.1" rx="1.05" />
        <rect x="2.2" y="13.7" width="3.1" height="3.1" rx="0.85" />
        <rect x="6.4" y="14.2" width="11.4" height="2.1" rx="1.05" />
      </g>
    </svg>
  )
}

export function WeekNav({
  label,
  view,
  onPrev,
  onNext,
  onToday,
  onToggleView,
}: Props) {
  const isMonth = view === 'month'
  return (
    <div className="week-nav">
      <button
        type="button"
        className="nav-btn"
        onClick={onPrev}
        aria-label={isMonth ? 'Previous month' : 'Previous week'}
      >
        ←
      </button>
      <div className="week-nav__center">
        <div className="week-nav__heading">
          <p className="week-nav__label">{label}</p>
          <button
            type="button"
            className="view-toggle"
            onClick={onToggleView}
            aria-label={isMonth ? 'Week view' : 'Month view'}
            title={isMonth ? 'Week view' : 'Month view'}
          >
            {isMonth ? <WeekStripIcon /> : <MonthGridIcon />}
            <span>{isMonth ? 'Week' : 'Month'}</span>
          </button>
        </div>
        <button type="button" className="text-btn" onClick={onToday}>
          {isMonth ? 'This month' : 'This week'}
        </button>
      </div>
      <button
        type="button"
        className="nav-btn"
        onClick={onNext}
        aria-label={isMonth ? 'Next month' : 'Next week'}
      >
        →
      </button>
    </div>
  )
}
