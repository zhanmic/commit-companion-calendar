import { useEffect, useMemo, useState } from 'react'
import { fetchScheduleData, fetchTeamConfig } from './api/commit'
import { GroupFilters } from './components/GroupFilters'
import { SettingsButton } from './components/SettingsButton'
import { ShareButton } from './components/ShareButton'
import { ThemeToggle } from './components/ThemeToggle'
import { WeekNav } from './components/WeekNav'
import { WeekSchedule } from './components/WeekSchedule'
import { expandEvents, expandMeets, expandPractices } from './lib/expand'
import { alwaysShowGroups, groupOrder } from './lib/groups'
import { navigate } from './lib/routing'
import {
  getStoredSettings,
  setStoredSettings,
  type ScheduleSettings,
} from './lib/settings'
import { getWeekModel, shiftWeek } from './lib/week'
import { PRODUCT_NAME } from './product'
import { useTenant } from './tenants/TenantContext'
import type { CommitEvent, CommitMeet } from './types'
import './App.css'

/** Week schedule UI for the active tenant (e.g. /DelmaDolphins). */
export function TenantSchedule() {
  const tenant = useTenant()
  const [anchor, setAnchor] = useState(() => new Date())
  const [events, setEvents] = useState<CommitEvent[]>([])
  const [meets, setMeets] = useState<CommitMeet[]>([])
  const [timeZone, setTimeZone] = useState(tenant.defaultTimeZone)
  const [settings, setSettings] = useState<ScheduleSettings>(() =>
    getStoredSettings(tenant),
  )
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(getStoredSettings(tenant).defaultGroups),
  )
  const [showMeets, setShowMeets] = useState(
    () => getStoredSettings(tenant).defaultShowMeets,
  )
  const [showEvents, setShowEvents] = useState(
    () => getStoredSettings(tenant).defaultShowEvents,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    document.title = `${tenant.displayName} · ${PRODUCT_NAME}`
  }, [tenant])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    setStoredSettings(tenant, settings)
  }, [tenant, settings])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const [config, schedule] = await Promise.all([
          fetchTeamConfig(tenant.superTeamId),
          fetchScheduleData(tenant.superTeamId, settings.queryMeets),
        ])
        if (cancelled) return
        setTimeZone(config.superTeam?.timezone ?? tenant.defaultTimeZone)
        setEvents(schedule.events ?? [])
        setMeets(settings.queryMeets ? (schedule.meets ?? []) : [])
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load schedule')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tenant, settings.queryMeets])

  const week = useMemo(
    () => getWeekModel(anchor, timeZone),
    [anchor, timeZone],
  )

  const expandOptions = useMemo(
    () => ({
      timeZone,
      practiceNameFormat: settings.practiceNameFormat,
      parsePractice: tenant.parsePractice,
    }),
    [timeZone, settings.practiceNameFormat, tenant],
  )

  const weekOccurrences = useMemo(() => {
    const practices = expandPractices(
      events,
      week.rangeStart,
      week.rangeEnd,
      expandOptions,
    )

    const teamEvents = settings.includeTeamEvents
      ? expandEvents(
          events.filter((e) => e.label === 'event'),
          week.rangeStart,
          week.rangeEnd,
          expandOptions,
        )
      : []

    const meetOccurrences = settings.queryMeets
      ? expandMeets(meets, week.rangeStart, week.rangeEnd, tenant.parseMeet)
      : []

    return [...practices, ...teamEvents, ...meetOccurrences].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    )
  }, [events, meets, week, expandOptions, settings, tenant])

  const practiceOccurrences = useMemo(
    () => weekOccurrences.filter((o) => o.label === 'practice'),
    [weekOccurrences],
  )

  const eventOccurrences = useMemo(
    () => weekOccurrences.filter((o) => o.label === 'event'),
    [weekOccurrences],
  )

  const meetOccurrences = useMemo(
    () => weekOccurrences.filter((o) => o.label === 'meet'),
    [weekOccurrences],
  )

  const availableTeams = useMemo(() => {
    const present = new Set<string>()
    for (const occ of practiceOccurrences) {
      for (const t of occ.subTeams) present.add(t)
    }
    const always = new Set(alwaysShowGroups(tenant))
    return groupOrder(tenant).filter((t) => always.has(t) || present.has(t))
  }, [practiceOccurrences, tenant])

  const counts = useMemo(() => {
    const map: Partial<Record<string, number>> = {}
    for (const occ of practiceOccurrences) {
      for (const t of occ.subTeams) {
        map[t] = (map[t] ?? 0) + 1
      }
    }
    return map
  }, [practiceOccurrences])

  const filtered = useMemo(() => {
    const practices = practiceOccurrences.filter((o) =>
      tenant.occurrenceMatchesTeams(o.subTeams, selected),
    )
    const teamEvents =
      settings.includeTeamEvents && showEvents ? eventOccurrences : []
    const shownMeets =
      settings.queryMeets && showMeets ? meetOccurrences : []
    return [...practices, ...teamEvents, ...shownMeets].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    )
  }, [
    practiceOccurrences,
    eventOccurrences,
    meetOccurrences,
    selected,
    settings.includeTeamEvents,
    settings.queryMeets,
    showEvents,
    showMeets,
    tenant,
  ])

  /** Phone → concise carpool-style rows for any group selection. */
  const fitMode = isMobile
  /** Few sessions fill the screen; more sessions scroll inside the list. */
  const fitScroll = fitMode && filtered.length > 8

  return (
    <div
      className={`app${fitMode ? ' app--fit' : ''}${fitScroll ? ' app--fit-scroll' : ''}`}
    >
      <div className="app__glow" aria-hidden />
      <header className="hero">
        <div className="hero__top">
          <div className="hero__controls">
            <SettingsButton settings={settings} onChange={setSettings} />
            <ShareButton
              title={`${tenant.displayName} · ${PRODUCT_NAME}`}
              text={`Weekly swim schedule for ${tenant.displayName}`}
            />
          </div>
          <div className="hero__brand-block">
            <button
              type="button"
              className="hero__product"
              onClick={() => navigate('/')}
            >
              {PRODUCT_NAME}
            </button>
            <h1 className="hero__brand">{tenant.displayName}</h1>
          </div>
          <div className="hero__actions">
            {tenant.links.carpool ? (
              <a
                className="hero__carpool"
                href={tenant.links.carpool}
                target="_blank"
                rel="noreferrer"
              >
                Carpool
              </a>
            ) : null}
            <ThemeToggle />
          </div>
        </div>
        <p className="hero__sub">
          Weekly view by group — powered by the live Commit calendar API.
        </p>
      </header>

      <main className="panel">
        <WeekNav
          label={week.label}
          onPrev={() => setAnchor((d) => shiftWeek(d, -1))}
          onNext={() => setAnchor((d) => shiftWeek(d, 1))}
          onToday={() => setAnchor(new Date())}
        />

        {loading ? (
          <div className="state">Loading schedule…</div>
        ) : error ? (
          <div className="state state--error">{error}</div>
        ) : (
          <>
            <GroupFilters
              available={availableTeams}
              selected={selected}
              onChange={setSelected}
              counts={counts}
              eventFilter={
                settings.includeTeamEvents
                  ? {
                      count: eventOccurrences.length,
                      selected: showEvents,
                      onChange: setShowEvents,
                    }
                  : null
              }
              meetFilter={
                settings.queryMeets
                  ? {
                      count: meetOccurrences.length,
                      selected: showMeets,
                      onChange: setShowMeets,
                    }
                  : null
              }
              weekCalendar={{
                occurrences: filtered,
                calendarName: `${tenant.displayName} · ${week.label}`,
              }}
            />

            {filtered.length === 0 ? (
              <div className="state">
                No sessions this week for the selected groups.
              </div>
            ) : (
              <WeekSchedule
                week={week}
                occurrences={filtered}
                fitMode={fitMode}
              />
            )}
          </>
        )}

        <footer className="footer">
          {tenant.links.officialCalendar ? (
            <>
              <a
                href={tenant.links.officialCalendar}
                target="_blank"
                rel="noreferrer"
              >
                Official Commit calendar
              </a>
              <span>·</span>
            </>
          ) : null}
          <span>{timeZone.replace(/_/g, ' ')}</span>
        </footer>
      </main>
    </div>
  )
}
