import type { CSSProperties } from 'react'
import {
  EVENT_COLOR,
  MEET_COLOR,
  colorForGroup,
  groupOrder,
} from '../lib/groups'
import { PRODUCT_NAME } from '../product'
import { useTenant } from '../tenants/TenantContext'
import type { Occurrence } from '../types'
import { AddToCalendarButton } from './AddToCalendarButton'

interface KindFilter {
  count: number
  selected: boolean
  onChange: (selected: boolean) => void
}

interface Props {
  available: string[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  counts: Partial<Record<string, number>>
  /** When Include team events is on, show a separate Event chip (not a group). */
  eventFilter?: KindFilter | null
  /** When Query meets is on, show a separate Meet chip (not a group). */
  meetFilter?: KindFilter | null
  /** Selected week sessions for the right-aligned Add to Calendar control. */
  weekCalendar?: {
    occurrences: Occurrence[]
    calendarName: string
  } | null
  /** Spoken/visible count window, e.g. "this week" or "this month". */
  countPeriod?: string
}

export function GroupFilters({
  available,
  selected,
  onChange,
  counts,
  eventFilter = null,
  meetFilter = null,
  weekCalendar = null,
  countPeriod = 'this week',
}: Props) {
  const tenant = useTenant()
  const teams = groupOrder(tenant).filter((t) => available.includes(t))
  const hasKindFilters = Boolean(eventFilter || meetFilter)
  const showKindsRow = hasKindFilters || Boolean(weekCalendar)

  function toggle(team: string) {
    const next = new Set(selected)
    if (next.has(team)) next.delete(team)
    else next.add(team)
    onChange(next)
  }

  function selectAll() {
    onChange(new Set(teams))
    eventFilter?.onChange(true)
    meetFilter?.onChange(true)
  }

  function clearAll() {
    onChange(new Set())
    eventFilter?.onChange(false)
    meetFilter?.onChange(false)
  }

  return (
    <section className="filters" aria-label="Schedule filters">
      <div className="filters__header">
        <h2>Filters</h2>
        <div className="filters__actions">
          <button type="button" className="text-btn" onClick={selectAll}>
            All
          </button>
          <button type="button" className="text-btn" onClick={clearAll}>
            Clear
          </button>
        </div>
      </div>

      <div className="filters__rows">
        <div className="filters__row" role="group" aria-label="Groups">
          <div className="filters__list">
            {teams.map((team) => {
              const active = selected.has(team)
              const count = counts[team] ?? 0
              return (
                <button
                  key={team}
                  type="button"
                  className={`filter-chip${active ? ' is-active' : ''}`}
                  style={
                    {
                      '--chip-color': colorForGroup(tenant, team),
                    } as CSSProperties
                  }
                  aria-pressed={active}
                  aria-label={`${team}, ${count} ${countPeriod}`}
                  onClick={() => toggle(team)}
                >
                  <span className="filter-chip__dot" aria-hidden />
                  <span className="filter-chip__label">{team}</span>
                  <span
                    className="filter-chip__count"
                    aria-label={`${count} ${countPeriod}`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {showKindsRow ? (
          <div
            className="filters__row filters__row--kinds"
            role="group"
            aria-label="Events, meets, and calendar"
          >
            <div className="filters__list">
              {eventFilter ? (
                <button
                  type="button"
                  className={`filter-chip filter-chip--event${
                    eventFilter.selected ? ' is-active' : ''
                  }`}
                  style={{ '--chip-color': EVENT_COLOR } as CSSProperties}
                  aria-pressed={eventFilter.selected}
                  aria-label={`Events, ${eventFilter.count} ${countPeriod}`}
                  onClick={() => eventFilter.onChange(!eventFilter.selected)}
                >
                  <span className="filter-chip__dot" aria-hidden />
                  <span className="filter-chip__label">Event</span>
                  <span
                    className="filter-chip__count"
                    aria-label={`${eventFilter.count} ${countPeriod}`}
                  >
                    {eventFilter.count}
                  </span>
                </button>
              ) : null}

              {meetFilter ? (
                <button
                  type="button"
                  className={`filter-chip filter-chip--meet${
                    meetFilter.selected ? ' is-active' : ''
                  }`}
                  style={{ '--chip-color': MEET_COLOR } as CSSProperties}
                  aria-pressed={meetFilter.selected}
                  aria-label={`Meets, ${meetFilter.count} ${countPeriod}`}
                  onClick={() => meetFilter.onChange(!meetFilter.selected)}
                >
                  <span className="filter-chip__dot" aria-hidden />
                  <span className="filter-chip__label">Meet</span>
                  <span
                    className="filter-chip__count"
                    aria-label={`${meetFilter.count} ${countPeriod}`}
                  >
                    {meetFilter.count}
                  </span>
                </button>
              ) : null}
            </div>

            {weekCalendar ? (
              <AddToCalendarButton
                occurrences={weekCalendar.occurrences}
                label="Add to Calendar"
                calendarName={weekCalendar.calendarName}
                calendarOptions={{
                  sourceLabel: `${tenant.displayName} · ${PRODUCT_NAME}`,
                  filenamePrefix: tenant.icsFilenamePrefix,
                }}
                className="filters__cal"
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
