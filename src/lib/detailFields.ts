import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import type {
  CommitEvent,
  CommitMeet,
  DetailField,
  SubTeam,
} from '../types'
import { TEAM_TZ } from './week'

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function pushField(
  fields: DetailField[],
  label: string,
  value: string | null | undefined,
) {
  const trimmed = value?.trim()
  if (!trimmed) return
  fields.push({ label, value: trimmed })
}

function formatRecurring(event: CommitEvent): string | null {
  const rec = event.recurring
  if (!rec) return null
  const days =
    rec.days && rec.days.length
      ? rec.days.map((d) => WEEKDAY_NAMES[d] ?? String(d)).join(', ')
      : null
  const until = format(
    toZonedTime(new Date(rec.endDate), TEAM_TZ),
    'MMM d, yyyy',
  )
  const parts = [rec.period]
  if (days) parts.push(days)
  parts.push(`until ${until}`)
  return parts.join(' · ')
}

export function buildEventDetailFields(
  event: CommitEvent,
  occurrenceName: string,
  subTeams: SubTeam[],
  location: string | null,
): DetailField[] {
  // Name / start–end are already shown on the day-sheet card header — omit here.
  const fields: DetailField[] = []
  if (occurrenceName.trim() !== event.name.trim()) {
    pushField(fields, 'Series name', event.name)
  }
  pushField(fields, 'Type', event.label)
  pushField(fields, 'Groups', subTeams.join(', '))
  pushField(fields, 'Location', location)
  pushField(fields, 'Recurs', formatRecurring(event))
  return fields
}

export function buildMeetDetailFields(
  meet: CommitMeet,
  occurrenceName: string,
  location: string | null,
): DetailField[] {
  // Name / start–end are already shown on the day-sheet card header — omit here.
  const fields: DetailField[] = []
  if (
    meet.titleEventsFile &&
    meet.titleEventsFile.trim() &&
    meet.titleEventsFile.trim() !== occurrenceName.trim()
  ) {
    pushField(fields, 'Meet file title', meet.titleEventsFile)
  }
  pushField(fields, 'Type', 'meet')
  pushField(fields, 'Location', location)
  pushField(fields, 'Venue', meet.locationDetails)
  pushField(
    fields,
    'City',
    [meet.city, meet.state].filter(Boolean).join(', ') || null,
  )
  pushField(fields, 'Course', meet.course)
  pushField(fields, 'Status', meet.status)
  return fields
}
