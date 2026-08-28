/**
 * Build a ~1 month Commit calendar summary for outreach drafting.
 * Uses the same website-data-2b dump as the product calendar (no date-range API).
 * Sanitized: no coach accounts / PII.
 */

export interface MonthWindow {
  startIso: string
  endIso: string
  label: string
}

export interface PracticePattern {
  name: string
  days: string[]
  typicalTime: string | null
  occurrencesInWindow: number
}

export interface MonthMeet {
  title: string
  when: string
  location: string | null
  course: string | null
  status: string | null
}

export interface MonthTeamEvent {
  name: string
  when: string
  description: string | null
}

export interface MonthCalendarSummary {
  window: MonthWindow
  timeZone: string
  /** Local calendar date this summary was built for (YYYY-MM-DD). */
  asOfYmd: string
  rawEventCount: number
  rawMeetCount: number
  practiceOccurrences: number
  teamEventOccurrences: number
  cancellationCount: number
  practicePatterns: PracticePattern[]
  upcomingMeets: MonthMeet[]
  teamEvents: MonthTeamEvent[]
  pitchAngles: string[]
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseDate(value: unknown): Date | null {
  const raw = str(value)
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** YYYY-MM-DD in an IANA timezone (falls back to UTC). */
export function ymdInZone(d: Date, timeZone?: string | null): string {
  const tz = timeZone?.trim()
  if (!tz || tz === 'unknown') return ymd(d)
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  } catch {
    return ymd(d)
  }
}

export function formatHumanDate(
  d: Date = new Date(),
  timeZone?: string | null,
): string {
  const tz = timeZone?.trim() || 'America/New_York'
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d)
  } catch {
    return ymd(d)
  }
}

function formatTimeUtc(d: Date): string {
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return m ? `${h12}:${String(m).padStart(2, '0')}${ampm}` : `${h12}${ampm}`
}

function trunc(text: string | null, max: number): string | null {
  if (!text) return null
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

function looksLikeCancel(name: string): boolean {
  return /\b(cancel|cancelled|canceled|no practice|no practices|team break|summer break)\b/i.test(
    name,
  )
}

function advance(cursor: Date, period: string): Date {
  const next = new Date(cursor.getTime())
  switch (period) {
    case 'monthly':
      next.setUTCMonth(next.getUTCMonth() + 1)
      return next
    case 'yearly':
      next.setUTCFullYear(next.getUTCFullYear() + 1)
      return next
    case 'weekly':
      next.setUTCDate(next.getUTCDate() + 7)
      return next
    case 'weekdays':
    default:
      next.setUTCDate(next.getUTCDate() + 1)
      return next
  }
}

interface ExpandedOcc {
  name: string
  label: string
  start: Date
  end: Date
  description: string | null
}

/** Expand Commit events into occurrences in [rangeStart, rangeEnd). */
export function expandEventsInRange(
  events: unknown[],
  rangeStart: Date,
  rangeEnd: Date,
): { occurrences: ExpandedOcc[]; cancellationCount: number } {
  const occurrences: ExpandedOcc[] = []
  let cancellationCount = 0

  for (const raw of events) {
    const event = asRecord(raw)
    if (!event) continue
    const name = str(event.name)
    const label = str(event.label) || 'event'
    const baseStart = parseDate(event.startDate)
    const baseEnd = parseDate(event.endDate)
    if (!name || !baseStart || !baseEnd) continue
    const description = trunc(str(event.description), 140)
    const durationMs = Math.max(0, baseEnd.getTime() - baseStart.getTime())
    const rec = asRecord(event.recurring)

    if (!rec) {
      if (baseStart >= rangeStart && baseStart < rangeEnd) {
        occurrences.push({ name, label, start: baseStart, end: baseEnd, description })
        if (looksLikeCancel(name)) cancellationCount += 1
      }
      continue
    }

    const until = parseDate(rec.endDate)
    if (!until) continue
    const period = str(rec.period) || 'weekdays'
    const allowedDays = Array.isArray(rec.days)
      ? new Set(rec.days.filter((d): d is number => typeof d === 'number'))
      : new Set([1, 2, 3, 4, 5])

    const customs = new Map<number, Record<string, unknown>>()
    if (Array.isArray(rec.custom)) {
      for (const c of rec.custom) {
        const co = asRecord(c)
        if (!co || typeof co.id !== 'number') continue
        customs.set(co.id, co)
        // Count removals whose day id falls in our window (Commit day-start ms)
        if (co.removed === true && co.id >= rangeStart.getTime() && co.id < rangeEnd.getTime()) {
          cancellationCount += 1
        }
      }
    }

    let cursor = new Date(
      Date.UTC(
        baseStart.getUTCFullYear(),
        baseStart.getUTCMonth(),
        baseStart.getUTCDate(),
        baseStart.getUTCHours(),
        baseStart.getUTCMinutes(),
        baseStart.getUTCSeconds(),
      ),
    )
    const untilUtc = new Date(
      Date.UTC(
        until.getUTCFullYear(),
        until.getUTCMonth(),
        until.getUTCDate(),
        until.getUTCHours(),
        until.getUTCMinutes(),
        until.getUTCSeconds(),
      ),
    )

    let guard = 0
    while (cursor <= untilUtc && guard < 900) {
      guard += 1

      if (period === 'weekdays' && !allowedDays.has(cursor.getUTCDay())) {
        cursor = advance(cursor, period)
        continue
      }

      if (cursor.getTime() + durationMs < rangeStart.getTime()) {
        cursor = advance(cursor, period)
        continue
      }
      if (cursor >= rangeEnd) break

      // Match custom by nearest local midnight approximations (UTC day + common US offsets)
      const dayCandidates = [
        Date.UTC(
          cursor.getUTCFullYear(),
          cursor.getUTCMonth(),
          cursor.getUTCDate(),
          0,
          0,
          0,
          0,
        ),
        Date.UTC(
          cursor.getUTCFullYear(),
          cursor.getUTCMonth(),
          cursor.getUTCDate(),
          4,
          0,
          0,
          0,
        ),
        Date.UTC(
          cursor.getUTCFullYear(),
          cursor.getUTCMonth(),
          cursor.getUTCDate(),
          5,
          0,
          0,
          0,
        ),
      ]
      let custom: Record<string, unknown> | undefined
      for (const id of dayCandidates) {
        if (customs.has(id)) {
          custom = customs.get(id)
          break
        }
      }

      if (custom?.removed === true) {
        cursor = advance(cursor, period)
        continue
      }

      let occStart = cursor
      let occEnd = new Date(cursor.getTime() + durationMs)
      let occName = name
      if (str(custom?.startTime) && str(custom?.endTime)) {
        const cs = parseDate(custom?.startTime)
        const ce = parseDate(custom?.endTime)
        if (cs && ce) {
          occStart = cs
          occEnd = ce
          occName = str(custom?.name) || name
        }
      }

      if (occStart >= rangeStart && occStart < rangeEnd) {
        occurrences.push({
          name: occName,
          label,
          start: occStart,
          end: occEnd,
          description,
        })
        if (looksLikeCancel(occName)) cancellationCount += 1
      }

      cursor = advance(cursor, period)
    }
  }

  occurrences.sort((a, b) => a.start.getTime() - b.start.getTime())
  return { occurrences, cancellationCount }
}

function meetInRange(
  meets: unknown[],
  rangeStart: Date,
  rangeEnd: Date,
): MonthMeet[] {
  const out: MonthMeet[] = []
  for (const raw of meets) {
    const m = asRecord(raw)
    if (!m) continue
    const start = parseDate(m.startDateTime) || parseDate(m.startDate)
    if (!start || start < rangeStart || start >= rangeEnd) continue
    out.push({
      title:
        str(m.userTitle) ||
        str(m.titleEventsFile) ||
        str(m.name) ||
        'Meet',
      when: ymd(start),
      location: str(m.locationDetails),
      course: str(m.course),
      status: str(m.status),
    })
  }
  return out.sort((a, b) => a.when.localeCompare(b.when)).slice(0, 12)
}

function buildPracticePatterns(practices: ExpandedOcc[]): PracticePattern[] {
  const map = new Map<
    string,
    { days: Set<number>; times: Map<string, number>; count: number }
  >()

  for (const p of practices) {
    const key = p.name
    let row = map.get(key)
    if (!row) {
      row = { days: new Set(), times: new Map(), count: 0 }
      map.set(key, row)
    }
    row.count += 1
    row.days.add(p.start.getUTCDay())
    const t = formatTimeUtc(p.start)
    row.times.set(t, (row.times.get(t) || 0) + 1)
  }

  return [...map.entries()]
    .map(([name, row]) => {
      let bestTime: string | null = null
      let bestN = 0
      for (const [t, n] of row.times) {
        if (n > bestN) {
          bestN = n
          bestTime = t
        }
      }
      return {
        name,
        days: [...row.days]
          .sort((a, b) => a - b)
          .map((d) => DAY_NAMES[d] ?? String(d)),
        typicalTime: bestTime,
        occurrencesInWindow: row.count,
      }
    })
    .sort((a, b) => b.occurrencesInWindow - a.occurrencesInWindow)
    .slice(0, 10)
}

function splitByAsOf<T extends { when: string }>(
  items: T[],
  asOfYmd: string,
): { past: T[]; future: T[] } {
  const past = items.filter((i) => i.when < asOfYmd)
  const future = items.filter((i) => i.when > asOfYmd)
  return { past, future }
}

function pitchAngles(
  summary: Omit<MonthCalendarSummary, 'pitchAngles'>,
): string[] {
  const { past: pastMeets, future: futureMeets } = splitByAsOf(
    summary.upcomingMeets,
    summary.asOfYmd,
  )
  const angles: string[] = []
  if (summary.practiceOccurrences >= 8) {
    angles.push(
      `Busy recent block (~${summary.practiceOccurrences} practice sessions in window) — parents need a clear week view.`,
    )
  }
  if (summary.practicePatterns.length >= 3) {
    angles.push(
      `Multiple practice tracks (${summary.practicePatterns.length} named series) — easy for families to get lost.`,
    )
  }
  if (summary.cancellationCount > 0) {
    angles.push(
      `${summary.cancellationCount} cancel/break signal(s) in-window — good pitch for morning email digests catching overnight Commit changes.`,
    )
  }
  if (futureMeets.length > 0) {
    const next = futureMeets[0]
    angles.push(
      `Upcoming Commit meet still ahead: ${next.title} on ${next.when} — cite as on their Commit calendar; only this kind of date may be called upcoming.`,
    )
  }
  if (pastMeets.length > 0) {
    const newest = pastMeets[pastMeets.length - 1]
    angles.push(
      `Recent Commit meet already happened: ${newest.title} on ${newest.when} — past tense, on Commit (not MySwimDay), never as upcoming.`,
    )
  }
  if (futureMeets.length === 0 && summary.practiceOccurrences > 0) {
    angles.push(
      'Forward calendar looks quiet (season transition) — pitch as ready for fall short-course / registration.',
    )
  }
  if (summary.teamEvents.some((e) => looksLikeCancel(e.name))) {
    angles.push('Team break / no-practice notices appear on the calendar.')
  }
  if (!angles.length) {
    angles.push(
      'Team publishes on Commit — My Swim Day can mirror that as a mobile week view plus optional daily/weekly email digests (no login/app).',
    )
  }
  return angles.slice(0, 5)
}

/**
 * Calendar review window for first-touch pitch:
 * last 30 days + next 14 days.
 * Mid-summer teams often have an empty forward schedule (season ended /
 * fall not published yet) — recent practices/meets still personalize well.
 */
export function buildMonthCalendarSummary(
  data: { events?: unknown[]; meets?: unknown[] },
  opts?: { timeZone?: string | null; now?: Date },
): MonthCalendarSummary {
  const now = opts?.now ?? new Date()
  const tz = opts?.timeZone?.trim() || 'America/New_York'
  const asOfYmd = ymdInZone(now, tz)
  const rangeStart = new Date(now.getTime())
  rangeStart.setUTCHours(0, 0, 0, 0)
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 30)
  const rangeEnd = new Date(now.getTime())
  rangeEnd.setUTCHours(0, 0, 0, 0)
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 14)

  const events = Array.isArray(data.events) ? data.events : []
  const meets = Array.isArray(data.meets) ? data.meets : []
  const { occurrences, cancellationCount } = expandEventsInRange(
    events,
    rangeStart,
    rangeEnd,
  )

  const practices = occurrences.filter((o) => o.label === 'practice')
  const teamEvents = occurrences
    .filter((o) => o.label === 'event')
    .slice(0, 10)
    .map((o) => ({
      name: o.name,
      when: ymd(o.start),
      description: o.description,
    }))

  const practicePatterns = buildPracticePatterns(practices)
  const upcomingMeets = meetInRange(meets, rangeStart, rangeEnd)

  const partial: Omit<MonthCalendarSummary, 'pitchAngles'> = {
    window: {
      startIso: rangeStart.toISOString(),
      endIso: rangeEnd.toISOString(),
      label: `${ymd(rangeStart)} → ${ymd(new Date(rangeEnd.getTime() - 1))} (past 30d + next 14d)`,
    },
    timeZone: tz,
    asOfYmd,
    rawEventCount: events.length,
    rawMeetCount: meets.length,
    practiceOccurrences: practices.length,
    teamEventOccurrences: occurrences.filter((o) => o.label === 'event').length,
    cancellationCount,
    practicePatterns,
    upcomingMeets,
    teamEvents,
  }

  return { ...partial, pitchAngles: pitchAngles(partial) }
}

export function formatMonthCalendarForPrompt(
  summary: MonthCalendarSummary | null,
): string {
  if (!summary) {
    return 'Month calendar: unavailable (no superTeamId or fetch failed).'
  }

  const asOf = summary.asOfYmd
  const { past: pastMeets, future: futureMeets } = splitByAsOf(
    summary.upcomingMeets,
    asOf,
  )
  const { past: pastEvents, future: futureEvents } = splitByAsOf(
    summary.teamEvents,
    asOf,
  )

  const lines = [
    `TODAY (ground truth for past vs future): ${asOf} in ${summary.timeZone}.`,
    `A date < ${asOf} is PAST (recent). A date > ${asOf} is FUTURE (upcoming). Do not call past dates upcoming.`,
    `SOURCE: this dump is their public COMMIT Swimming calendar. They do not have a MySwimDay tenant. Cite as Commit facts; offer MySwimDay as a sync + mobile week view.`,
    `Commit calendar review window: ${summary.window.label}`,
    `Timezone (team): ${summary.timeZone}`,
    `Published templates: ${summary.rawEventCount} events, ${summary.rawMeetCount} meets (full dump; window below is expanded).`,
    `In-window: ${summary.practiceOccurrences} practice sessions, ${summary.teamEventOccurrences} team events, ${summary.upcomingMeets.length} meets, ${summary.cancellationCount} cancel/break signals.`,
    'Pitch angles from calendar:',
    ...summary.pitchAngles.map((a) => `- ${a}`),
  ]

  if (summary.practicePatterns.length) {
    lines.push('Practice series in window (name · days · typical start · count):')
    for (const p of summary.practicePatterns.slice(0, 8)) {
      lines.push(
        `  • ${p.name} · ${p.days.join('/')} · ${p.typicalTime ?? '?'} · ×${p.occurrencesInWindow}`,
      )
    }
  }

  const meetLine = (m: MonthMeet) =>
    `  • ${m.title} (${m.when})${m.location ? ` @ ${m.location}` : ''}${
      m.course ? ` [${m.course}]` : ''
    }`

  if (pastMeets.length) {
    lines.push('PAST meets (already happened — past tense only):')
    for (const m of pastMeets.slice(-6)) lines.push(meetLine(m))
  }
  if (futureMeets.length) {
    lines.push('UPCOMING meets (still in the future):')
    for (const m of futureMeets.slice(0, 6)) lines.push(meetLine(m))
  }

  const eventLine = (e: MonthTeamEvent) =>
    `  • ${e.name} (${e.when})${e.description ? ` — ${e.description}` : ''}`

  if (pastEvents.length) {
    lines.push('PAST team events / notices:')
    for (const e of pastEvents.slice(-5)) lines.push(eventLine(e))
  }
  if (futureEvents.length) {
    lines.push('UPCOMING team events / notices:')
    for (const e of futureEvents.slice(0, 5)) lines.push(eventLine(e))
  }

  return lines.join('\n')
}
