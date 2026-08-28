import { useState, type CSSProperties, type KeyboardEvent } from 'react'
import {
  EVENT_COLOR,
  MEET_COLOR,
  accentPracticeGroup,
  colorForGroup,
  practiceGroupLabel,
} from '../lib/groups'
import { useTenant } from '../tenants/TenantContext'
import {
  dayHeading,
  formatTimeRange,
  formatTimeRangeCompact,
  isOccurrenceOnDay,
  type WeekModel,
} from '../lib/week'
import type { Occurrence } from '../types'
import { DayDetailSheet } from './DayDetailSheet'
import { ScrollableName } from './ScrollableName'
import { SessionKindIcon } from './SessionKindIcon'

interface Props {
  week: WeekModel
  occurrences: Occurrence[]
  /** Active group filter chips — drives multi-group accent/label. */
  selectedGroups?: Set<string>
  /** Mobile concise list (carpool-style rows) */
  fitMode?: boolean
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

function groupOccurrencesByDay(week: WeekModel, occurrences: Occurrence[]) {
  return week.days
    .map((day) => {
      const dayOccs = occurrences.filter((o) => isOccurrenceOnDay(o.start, day))
      return {
        day,
        heading: dayHeading(day),
        occurrences: dayOccs,
      }
    })
    .filter((group) => group.occurrences.length > 0)
}

function activateOnKey(
  event: KeyboardEvent,
  action: () => void,
) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    action()
  }
}

export function WeekSchedule({
  week,
  occurrences,
  selectedGroups,
  fitMode = false,
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

  function teamLabel(occ: Occurrence): string {
    return practiceGroupLabel(occ.subTeams, selectedGroups)
  }

  function openDayDetail(
    heading: ReturnType<typeof dayHeading>,
    dayOccs: Occurrence[],
  ) {
    setOpenDetail({
      title: `${heading.weekday}, ${heading.date}`,
      subtitle: `${dayOccs.length} session${dayOccs.length === 1 ? '' : 's'}`,
      occurrences: dayOccs,
    })
  }

  function openSessionDetail(
    heading: ReturnType<typeof dayHeading>,
    occ: Occurrence,
  ) {
    const kind = sessionKind(occ)
    setOpenDetail({
      title: `${heading.weekday}, ${heading.date}`,
      subtitle: sessionKindTitle(kind),
      occurrences: [occ],
    })
  }

  const dayGroups = groupOccurrencesByDay(week, occurrences)

  const detailSheet = openDetail ? (
    <DayDetailSheet
      title={openDetail.title}
      subtitle={openDetail.subtitle}
      occurrences={openDetail.occurrences}
      selectedGroups={selectedGroups}
      onClose={() => setOpenDetail(null)}
    />
  ) : null

  if (fitMode) {
    if (occurrences.length === 0) {
      return (
        <div className="week-list week-list--fit">
          <p className="day-col__empty">No practices</p>
        </div>
      )
    }

    return (
      <>
        <div className="week-list week-list--fit" role="list">
          {dayGroups.map((group) => (
            <section
              key={group.day.key}
              className={`day-group${group.heading.isToday ? ' is-today' : ''}`}
              role="listitem"
              style={
                {
                  '--day-sessions': String(group.occurrences.length),
                } as CSSProperties
              }
            >
              <header
                className="day-group__when day-group__when--interactive"
                role="button"
                tabIndex={0}
                aria-label={`${group.heading.weekday} ${group.heading.shortDate}, ${group.occurrences.length} sessions. Open full day details.`}
                onClick={() =>
                  openDayDetail(group.heading, group.occurrences)
                }
                onKeyDown={(event) =>
                  activateOnKey(event, () =>
                    openDayDetail(group.heading, group.occurrences),
                  )
                }
              >
                <span className="day-group__weekday">
                  {group.heading.weekday}
                </span>
                <span className="day-group__date">
                  {group.heading.shortDate}
                </span>
              </header>

              <div className="day-group__sessions">
                {group.occurrences.map((occ) => {
                  const kind = sessionKind(occ)
                  const isPractice = kind === 'practice'
                  const isMeet = kind === 'meet'
                  const team = teamLabel(occ)
                  const loc = kind === 'event' ? null : occ.location
                  const time = formatTimeRangeCompact(occ.start, occ.end)
                  const label = [
                    sessionKindTitle(kind),
                    isPractice ? team : occ.name,
                    loc,
                    time,
                    'Open details',
                  ]
                    .filter(Boolean)
                    .join(', ')
                  return (
                    <article
                      key={occ.id}
                      className={`day-session day-session--interactive day-session--${kind}${
                        isMeet && loc ? ' day-session--stacked' : ''
                      }`}
                      style={
                        {
                          '--card-accent': sessionAccent(occ),
                        } as CSSProperties
                      }
                      role="button"
                      tabIndex={0}
                      aria-label={label}
                      onClick={() => openSessionDetail(group.heading, occ)}
                      onKeyDown={(event) =>
                        activateOnKey(event, () =>
                          openSessionDetail(group.heading, occ),
                        )
                      }
                    >
                      <SessionKindIcon
                        kind={kind}
                        className="day-session__kind"
                      />
                      {isMeet ? (
                        <span className="day-session__body">
                          <span className="day-session__main">
                            <ScrollableName
                              text={occ.name}
                              className="day-session__name"
                            />
                            <span className="day-session__time">{time}</span>
                          </span>
                          {loc ? (
                            <span className="day-session__loc">{loc}</span>
                          ) : null}
                        </span>
                      ) : (
                        <>
                          {isPractice ? (
                            <span className="day-session__team">{team}</span>
                          ) : (
                            <ScrollableName
                              text={occ.name}
                              className="day-session__name"
                            />
                          )}
                          {loc ? (
                            <span className="day-session__loc">{loc}</span>
                          ) : null}
                          <span className="day-session__time">{time}</span>
                        </>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
        {detailSheet}
      </>
    )
  }

  return (
    <>
      <div className="week-grid" role="list">
        {week.days.map((day) => {
          const heading = dayHeading(day)
          const dayOccs = occurrences.filter((o) =>
            isOccurrenceOnDay(o.start, day),
          )
          const hasSessions = dayOccs.length > 0

          return (
            <section
              key={day.key}
              className={`day-col${heading.isToday ? ' is-today' : ''}`}
              role="listitem"
              aria-label={`${heading.weekday} ${heading.date}`}
            >
              <header
                className={`day-col__head${
                  hasSessions ? ' day-col__head--interactive' : ''
                }`}
                role={hasSessions ? 'button' : undefined}
                tabIndex={hasSessions ? 0 : undefined}
                aria-label={
                  hasSessions
                    ? `${heading.weekday} ${heading.date}, ${dayOccs.length} sessions. Open full day details.`
                    : undefined
                }
                onClick={
                  hasSessions
                    ? () => openDayDetail(heading, dayOccs)
                    : undefined
                }
                onKeyDown={
                  hasSessions
                    ? (event) =>
                        activateOnKey(event, () =>
                          openDayDetail(heading, dayOccs),
                        )
                    : undefined
                }
              >
                <span className="day-col__weekday">{heading.weekday}</span>
                <span className="day-col__date">{heading.date}</span>
              </header>

              <div className="day-col__body">
                {dayOccs.length === 0 ? (
                  <p className="day-col__empty">No practices</p>
                ) : (
                  dayOccs.map((occ) => {
                    const kind = sessionKind(occ)
                    const isPractice = kind === 'practice'
                    const team = teamLabel(occ)
                    const loc = kind === 'event' ? null : occ.location
                    return (
                      <article
                        key={occ.id}
                        className={`practice-card practice-card--interactive practice-card--${kind}`}
                        style={
                          {
                            '--card-accent': sessionAccent(occ),
                          } as CSSProperties
                        }
                        role="button"
                        tabIndex={0}
                        aria-label={[
                          sessionKindTitle(kind),
                          isPractice ? team : occ.name,
                          loc,
                          'Open details',
                        ]
                          .filter(Boolean)
                          .join(', ')}
                        onClick={() => openSessionDetail(heading, occ)}
                        onKeyDown={(event) =>
                          activateOnKey(event, () =>
                            openSessionDetail(heading, occ),
                          )
                        }
                      >
                        <div className="practice-card__meta">
                          <SessionKindIcon
                            kind={kind}
                            className="practice-card__kind"
                          />
                          {isPractice ? (
                            <span className="practice-card__team">{team}</span>
                          ) : null}
                          {loc ? (
                            <span className="practice-card__loc">{loc}</span>
                          ) : null}
                        </div>
                        <h3 className="practice-card__title">
                          {isPractice ? (
                            occ.name
                          ) : (
                            <ScrollableName text={occ.name} />
                          )}
                        </h3>
                        <p className="practice-card__time">
                          {formatTimeRange(occ.start, occ.end)}
                        </p>
                      </article>
                    )
                  })
                )}
              </div>
            </section>
          )
        })}
      </div>
      {detailSheet}
    </>
  )
}
