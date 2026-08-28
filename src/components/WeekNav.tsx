import type { ScheduleView } from '../lib/month'

interface Props {
  label: string
  view: ScheduleView
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onToggleView: () => void
}

function MonthGridIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
      <rect
        x="2.5"
        y="3.5"
        width="15"
        height="13"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M2.5 7.5h15M7.5 7.5v9M12.5 7.5v9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  )
}

function WeekStripIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
      <rect
        x="2.5"
        y="3.5"
        width="15"
        height="13"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M2.5 7.5h15M6.5 7.5v9M10 7.5v9M13.5 7.5v9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
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
        <p className="week-nav__label">{label}</p>
        <div className="week-nav__actions">
          <button type="button" className="text-btn" onClick={onToday}>
            {isMonth ? 'This month' : 'This week'}
          </button>
          <button
            type="button"
            className="nav-btn nav-btn--view"
            onClick={onToggleView}
            aria-label={isMonth ? 'Week view' : 'Month view'}
            title={isMonth ? 'Week view' : 'Month view'}
          >
            {isMonth ? <WeekStripIcon /> : <MonthGridIcon />}
          </button>
        </div>
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
