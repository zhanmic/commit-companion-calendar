import type { CommitMeet } from '../../types'
import type { MeetParser, ParsedMeet } from '../types'

function parseUtc(iso: string): Date {
  return new Date(iso)
}

/** Same Commit meet payload shape as Delmar. */
export const parseVortexMeet: MeetParser = (
  meet: CommitMeet,
): ParsedMeet | null => {
  const start = parseUtc(meet.startDateTime)
  const end = parseUtc(meet.endDateTime)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null
  }

  const name =
    (meet.userTitle && meet.userTitle.trim()) ||
    (meet.titleEventsFile && meet.titleEventsFile.trim()) ||
    'Meet'

  const location =
    (meet.locationDetails && meet.locationDetails.trim()) ||
    [meet.city, meet.state].filter(Boolean).join(', ') ||
    null

  return { name, location, start, end }
}
