import type { ReactNode } from 'react'

interface Props {
  label: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  /** Rendered before the next-week control (e.g. email subscribe). */
  trailing?: ReactNode
}

export function WeekNav({ label, onPrev, onNext, onToday, trailing }: Props) {
  return (
    <div className="week-nav">
      <button
        type="button"
        className="nav-btn"
        onClick={onPrev}
        aria-label="Previous week"
      >
        ←
      </button>
      <div className="week-nav__center">
        <p className="week-nav__label">{label}</p>
        <button type="button" className="text-btn" onClick={onToday}>
          This week
        </button>
      </div>
      <div className="week-nav__end">
        {trailing}
        <button
          type="button"
          className="nav-btn"
          onClick={onNext}
          aria-label="Next week"
        >
          →
        </button>
      </div>
    </div>
  )
}
