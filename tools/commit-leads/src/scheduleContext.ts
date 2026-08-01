import { fetchScheduleData, type WebsiteData2b } from './commitApi.js'
import {
  buildMonthCalendarSummary,
  formatMonthCalendarForPrompt,
  type MonthCalendarSummary,
} from './monthCalendar.js'

export type { MonthCalendarSummary }

export interface ScheduleProgramBrief {
  name: string
  programType: string | null
  status: string | null
}

/** Sanitized Commit schedule context for LLM prompts (no coach PII/secrets). */
export interface ScheduleContext {
  superTeamId: string
  fetchedAt: string
  eventCount: number
  meetCount: number
  programCount: number
  programs: ScheduleProgramBrief[]
  /** Expanded ~30-day ahead calendar used for personalized first outreach. */
  month: MonthCalendarSummary
  structureNotes: string[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function briefProgram(raw: unknown): ScheduleProgramBrief | null {
  const o = asRecord(raw)
  if (!o) return null
  const name = str(o.name)
  if (!name) return null
  return {
    name,
    programType: str(o.programType),
    status: str(o.status),
  }
}

function structureNotes(ctx: ScheduleContext): string[] {
  const notes: string[] = []
  const m = ctx.month
  notes.push(`~30-day window: ${m.window.label}`)
  notes.push(
    `${m.practiceOccurrences} practices, ${m.upcomingMeets.length} meets, ${m.cancellationCount} cancel/break signals in window.`,
  )
  if (ctx.programCount > 0) {
    notes.push(`${ctx.programCount} Commit program(s) on file.`)
  }
  if (m.practicePatterns.length >= 2) {
    notes.push(
      `Multiple practice series (e.g. ${m.practicePatterns
        .slice(0, 3)
        .map((p) => p.name)
        .join('; ')}).`,
    )
  }
  return notes
}

export function summarizeScheduleData(
  superTeamId: string,
  data: WebsiteData2b,
  timeZone?: string | null,
): ScheduleContext {
  const events = Array.isArray(data.events) ? data.events : []
  const meets = Array.isArray(data.meets) ? data.meets : []
  const programs = Array.isArray(data.programs) ? data.programs : []

  const programBriefs = programs
    .map(briefProgram)
    .filter((x): x is ScheduleProgramBrief => !!x)
    .slice(0, 8)

  const month = buildMonthCalendarSummary(
    { events, meets },
    { timeZone },
  )

  const ctx: ScheduleContext = {
    superTeamId,
    fetchedAt: new Date().toISOString(),
    eventCount: events.length,
    meetCount: meets.length,
    programCount: programs.length,
    programs: programBriefs,
    month,
    structureNotes: [],
  }
  ctx.structureNotes = structureNotes(ctx)
  return ctx
}

export async function loadScheduleContext(
  superTeamId: string,
  timeZone?: string | null,
): Promise<ScheduleContext> {
  const data = await fetchScheduleData(superTeamId, true)
  return summarizeScheduleData(superTeamId, data, timeZone)
}

export function formatScheduleForPrompt(ctx: ScheduleContext | null): string {
  if (!ctx) return 'Commit schedule: unavailable (no superTeamId or fetch failed).'

  const lines = [
    formatMonthCalendarForPrompt(ctx.month),
    '',
    'Structure notes:',
    ...ctx.structureNotes.map((n) => `- ${n}`),
  ]

  if (ctx.programs.length) {
    lines.push('Programs:')
    for (const p of ctx.programs.slice(0, 5)) {
      lines.push(
        `  • ${p.name}${p.programType ? ` (${p.programType})` : ''}${
          p.status ? ` [${p.status}]` : ''
        }`,
      )
    }
  }

  return lines.join('\n')
}
