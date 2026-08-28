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

function formatInstant(isoOrDate: string | Date, timeZone: string = TEAM_TZ) {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  if (Number.isNaN(date.getTime())) return String(isoOrDate)
  return format(toZonedTime(date, timeZone), 'EEE MMM d, yyyy · h:mm a')
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
  start: Date,
  end: Date,
  subTeams: SubTeam[],
  location: string | null,
): DetailField[] {
  const fields: DetailField[] = []
  pushField(fields, 'Name', occurrenceName)
  if (occurrenceName.trim() !== event.name.trim()) {
    pushField(fields, 'Series name', event.name)
  }
  pushField(fields, 'Type', event.label)
  pushField(fields, 'Groups', subTeams.join(', '))
  pushField(fields, 'Location', location)
  pushField(fields, 'Starts', formatInstant(start))
  pushField(fields, 'Ends', formatInstant(end))
  pushField(fields, 'Recurs', formatRecurring(event))
  return fields
}

export function buildMeetDetailFields(
  meet: CommitMeet,
  occurrenceName: string,
  start: Date,
  end: Date,
  location: string | null,
): DetailField[] {
  const fields: DetailField[] = []
  pushField(fields, 'Name', occurrenceName)
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
  pushField(fields, 'Starts', formatInstant(start))
  pushField(fields, 'Ends', formatInstant(end))
  return fields
}
