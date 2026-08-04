interface Props {
  label: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

export function WeekNav({ label, onPrev, onNext, onToday }: Props) {
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
      <button
        type="button"
        className="nav-btn"
        onClick={onNext}
        aria-label="Next week"
      >
        →
      </button>
    </div>
  )
}
