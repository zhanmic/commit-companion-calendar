import { useState, type CSSProperties, type KeyboardEvent } from 'react'
import {
  EVENT_COLOR,
  MEET_COLOR,
  accentPracticeGroup,
  colorForGroup,
  practiceGroupLabel,
} from '../lib/groups'
import type { MonthDetailLevel } from '../lib/settings'
import type { MonthModel, MonthWeek } from '../lib/month'
import { useTenant } from '../tenants/TenantContext'
import {
  dayHeading,
  formatTimeRangeCompact,
  isOccurrenceOnDay,
  type CalendarDay,
} from '../lib/week'
import type { Occurrence } from '../types'
import { DayDetailSheet } from './DayDetailSheet'

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DESKTOP_EVENT_LIMIT = 3
const MOBILE_DOT_LIMIT = 3

interface Props {
  month: MonthModel
  occurrences: Occurrence[]
  selectedGroups?: Set<string>
  fitMode?: boolean
  /** How much text to show in day cells. */
  detailLevel?: MonthDetailLevel
  onOpenWeek: (day: CalendarDay) => void
}

type SessionKind = 'practice' | 'meet' | 'event'

type OpenDetail = {
  title: string
  subtitle?: string
  occurrences: Occurrence[]
}

function sessionKind(occ: Occurrence): SessionKind {
  if (occ.label === 'meet') return 'meet'
  if (occ.label === 'event') return 'event'
  return 'practice'
}

function sessionKindTitle(kind: SessionKind): string {
  if (kind === 'meet') return 'Meet'
  if (kind === 'event') return 'Event'
  return 'Practice'
}

function activateOnKey(event: KeyboardEvent, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    action()
  }
}

function eventTitle(
  occ: Occurrence,
  selectedGroups?: Set<string>,
): string {
  const kind = sessionKind(occ)
  if (kind === 'practice') return practiceGroupLabel(occ.subTeams, selectedGroups)
  return occ.name
}

export function MonthSchedule({
  month,
  occurrences,
  selectedGroups,
  fitMode = false,
  detailLevel = 'dots',
  onOpenWeek,
}: Props) {
  const tenant = useTenant()
  const [openDetail, setOpenDetail] = useState<OpenDetail | null>(null)

  function sessionAccent(occ: Occurrence): string {
    const kind = sessionKind(occ)
    if (kind === 'meet') return MEET_COLOR
    if (kind === 'event') return EVENT_COLOR
    return colorForGroup(
      tenant,
      accentPracticeGroup(occ.subTeams, selectedGroups),
    )
  }

  function occsOnDay(day: CalendarDay): Occurrence[] {
    return occurrences.filter((o) => isOccurrenceOnDay(o.start, day))
  }

  function openDayDetail(day: CalendarDay, dayOccs: Occurrence[]) {
    if (dayOccs.length === 0) return
    const heading = dayHeading(day)
    setOpenDetail({
      title: `${heading.weekday}, ${heading.date}`,
      subtitle: `${dayOccs.length} session${dayOccs.length === 1 ? '' : 's'}`,
      occurrences: dayOccs,
    })
  }

  function openSessionDetail(day: CalendarDay, occ: Occurrence) {
    const heading = dayHeading(day)
    const kind = sessionKind(occ)
    setOpenDetail({
      title: `${heading.weekday}, ${heading.date}`,
      subtitle: sessionKindTitle(kind),
      occurrences: [occ],
    })
  }

  function openWeek(week: MonthWeek) {
    onOpenWeek(week.days[0])
  }

  /** Desktop keeps titles even on “Dots”; phones honor the compact setting. */
  const cellDetail: MonthDetailLevel =
    !fitMode && detailLevel === 'dots' ? 'group' : detailLevel
  const showDots = cellDetail === 'dots'
  const showLocation = cellDetail === 'location'
  const eventLimit = fitMode ? 2 : DESKTOP_EVENT_LIMIT

  function eventMeta(occ: Occurrence): string | null {
    if (showLocation && occ.location) return occ.location
    if (!fitMode) return formatStart(occ)
    return null
  }

  const detailSheet = openDetail ? (
    <DayDetailSheet
      title={openDetail.title}
      subtitle={openDetail.subtitle}
      occurrences={openDetail.occurrences}
      selectedGroups={selectedGroups}
      onClose={() => setOpenDetail(null)}
    />
  ) : null

  return (
    <>
      <div
        className={`month-grid${fitMode ? ' month-grid--fit' : ''}${
          showDots ? '' : ' month-grid--text'
        }`}
        role="grid"
        aria-label={month.label}
      >
        <div className="month-grid__head" role="row">
          <span className="month-week__num month-week__num--spacer" aria-hidden />
          {WEEKDAY_LETTERS.map((letter, i) => (
            <span key={`${letter}-${i}`} className="month-grid__dow" role="columnheader">
              {letter}
            </span>
          ))}
        </div>

        {month.weeks.map((week) => (
          <div
            key={week.days[0].key}
            className={`month-week${fitMode ? ' month-week--fit' : ''}`}
            role={fitMode ? 'button' : 'row'}
            {...(fitMode
              ? {
                  tabIndex: 0,
                  onClick: () => openWeek(week),
                  onKeyDown: (event: KeyboardEvent) =>
                    activateOnKey(event, () => openWeek(week)),
                  'aria-label': `Week of ${dayHeading(week.days[0]).date}, open week view`,
                }
              : {})}
          >
            {fitMode ? (
              <span className="month-week__num" aria-hidden>
                {week.weekNumber}
              </span>
            ) : (
              <button
                type="button"
                className="month-week__num"
                aria-label={`Open week of ${dayHeading(week.days[0]).date}`}
                onClick={() => openWeek(week)}
              >
                {week.weekNumber}
              </button>
            )}

            {week.days.map((day) => {
              const heading = dayHeading(day)
              const dayOccs = occsOnDay(day)
              const outside = day.month !== month.month
              const dots = uniqueAccents(dayOccs, sessionAccent).slice(
                0,
                MOBILE_DOT_LIMIT,
              )
              const shown = dayOccs.slice(0, eventLimit)
              const overflow = dayOccs.length - shown.length

              return (
                <div
                  key={day.key}
                  className={`month-day${outside ? ' month-day--outside' : ''}${
                    heading.isToday ? ' month-day--today' : ''
                  }`}
                  role="gridcell"
                  aria-selected={heading.isToday}
                >
                  {fitMode ? (
                    <span className="month-day__num" aria-hidden>
                      {day.date}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="month-day__num"
                      aria-label={`${heading.weekday} ${heading.date}${
                        dayOccs.length
                          ? `, ${dayOccs.length} session${dayOccs.length === 1 ? '' : 's'}`
                          : ''
                      }. Open details`}
                      disabled={dayOccs.length === 0}
                      onClick={() => openDayDetail(day, dayOccs)}
                    >
                      {day.date}
                    </button>
                  )}

                  {showDots ? (
                    <div className="month-dots" aria-hidden>
                      {dots.map((color, i) => (
                        <span
                          key={`${day.key}-dot-${i}`}
                          className="month-dot"
                          style={{ '--dot-color': color } as CSSProperties}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="month-day__events">
                      {shown.map((occ) => {
                        const title = eventTitle(occ, selectedGroups)
                        const meta = eventMeta(occ)
                        const label = [title, meta].filter(Boolean).join(', ')
                        if (fitMode) {
                          return (
                            <span
                              key={occ.id}
                              className="month-event month-event--static"
                              style={
                                {
                                  '--card-accent': sessionAccent(occ),
                                } as CSSProperties
                              }
                            >
                              <span className="month-event__title">{title}</span>
                              {meta ? (
                                <span className="month-event__time">{meta}</span>
                              ) : null}
                            </span>
                          )
                        }
                        return (
                          <button
                            key={occ.id}
                            type="button"
                            className="month-event"
                            style={
                              {
                                '--card-accent': sessionAccent(occ),
                              } as CSSProperties
                            }
                            aria-label={label}
                            onClick={() => openSessionDetail(day, occ)}
                          >
                            <span className="month-event__title">{title}</span>
                            {meta ? (
                              <span className="month-event__time">{meta}</span>
                            ) : null}
                          </button>
                        )
                      })}
                      {overflow > 0 ? (
                        fitMode ? (
                          <span className="month-event month-event--more month-event--static">
                            +{overflow} more
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="month-event month-event--more"
                            onClick={() => openDayDetail(day, dayOccs)}
                          >
                            +{overflow} more
                          </button>
                        )
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {detailSheet}
    </>
  )
}

function uniqueAccents(
  occs: Occurrence[],
  accentOf: (occ: Occurrence) => string,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const occ of occs) {
    const color = accentOf(occ)
    if (seen.has(color)) continue
    seen.add(color)
    out.push(color)
  }
  return out
}

function formatStart(occ: Occurrence): string {
  return formatTimeRangeCompact(occ.start, occ.end).split('–')[0] ?? ''
}
