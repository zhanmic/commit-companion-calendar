import { useState, type CSSProperties, type KeyboardEvent } from 'react'
import { EVENT_COLOR, MEET_COLOR, colorForGroup } from '../lib/groups'
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
  /** Mobile concise list (carpool-style rows) */
  fitMode?: boolean
}

type SessionKind = 'practice' | 'meet' | 'event'

function primaryTeam(teams: string[]): string | undefined {
  return teams[0]
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

export function WeekSchedule({ week, occurrences, fitMode = false }: Props) {
  const tenant = useTenant()
  const [openDayKey, setOpenDayKey] = useState<string | null>(null)

  function sessionAccent(occ: Occurrence): string {
    const kind = sessionKind(occ)
    if (kind === 'meet') return MEET_COLOR
    if (kind === 'event') return EVENT_COLOR
    return colorForGroup(tenant, primaryTeam(occ.subTeams))
  }

  const dayGroups = groupOccurrencesByDay(week, occurrences)
  const openGroup =
    openDayKey == null
      ? null
      : dayGroups.find((group) => group.day.key === openDayKey) ?? null

  function openDay(key: string) {
    setOpenDayKey(key)
  }

  function onDayKeyDown(event: KeyboardEvent, key: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openDay(key)
    }
  }

  const detailSheet = openGroup ? (
    <DayDetailSheet
      title={`${openGroup.heading.weekday}, ${openGroup.heading.date}`}
      subtitle={`${openGroup.occurrences.length} session${
        openGroup.occurrences.length === 1 ? '' : 's'
      } · Commit API details`}
      occurrences={openGroup.occurrences}
      onClose={() => setOpenDayKey(null)}
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
              className={`day-group day-group--interactive${
                group.heading.isToday ? ' is-today' : ''
              }`}
              role="button"
              tabIndex={0}
              aria-label={`${group.heading.weekday} ${group.heading.shortDate}, ${group.occurrences.length} sessions. Open full details.`}
              style={
                {
                  '--day-sessions': String(group.occurrences.length),
                } as CSSProperties
              }
              onClick={() => openDay(group.day.key)}
              onKeyDown={(event) => onDayKeyDown(event, group.day.key)}
            >
              <header className="day-group__when">
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
                  const team = primaryTeam(occ.subTeams)
                  const loc = kind === 'event' ? null : occ.location
                  const time = formatTimeRangeCompact(occ.start, occ.end)
                  return (
                    <article
                      key={occ.id}
                      className={`day-session day-session--${kind}${
                        isMeet && loc ? ' day-session--stacked' : ''
                      }`}
                      style={
                        {
                          '--card-accent': sessionAccent(occ),
                        } as CSSProperties
                      }
                      aria-label={[
                        sessionKindTitle(kind),
                        isPractice ? team : occ.name,
                        loc,
                        time,
                      ]
                        .filter(Boolean)
                        .join(', ')}
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
          const interactive = dayOccs.length > 0

          return (
            <section
              key={day.key}
              className={`day-col${heading.isToday ? ' is-today' : ''}${
                interactive ? ' day-col--interactive' : ''
              }`}
              role={interactive ? 'button' : 'listitem'}
              tabIndex={interactive ? 0 : undefined}
              aria-label={
                interactive
                  ? `${heading.weekday} ${heading.date}, ${dayOccs.length} sessions. Open full details.`
                  : `${heading.weekday} ${heading.date}`
              }
              onClick={interactive ? () => openDay(day.key) : undefined}
              onKeyDown={
                interactive
                  ? (event) => onDayKeyDown(event, day.key)
                  : undefined
              }
            >
              <header className="day-col__head">
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
                    const team = primaryTeam(occ.subTeams)
                    const loc = kind === 'event' ? null : occ.location
                    return (
                      <article
                        key={occ.id}
                        className={`practice-card practice-card--${kind}`}
                        style={
                          {
                            '--card-accent': sessionAccent(occ),
                          } as CSSProperties
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
