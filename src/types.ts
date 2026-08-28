export type EventLabel = 'practice' | 'event' | string

export interface RecurringCustom {
  id: number
  removed?: boolean
  name?: string
  startTime?: string
  endTime?: string
  attachments?: unknown[]
}

export interface Recurring {
  period: 'weekdays' | 'weekly' | 'monthly' | 'yearly' | string
  endDate: string
  days?: number[]
  custom?: RecurringCustom[]
}

export interface CommitEvent {
  _id: string
  label: EventLabel
  name: string
  /** Free-text from Commit; often includes pool / venue. */
  description?: string
  startDate: string
  endDate: string
  recurring?: Recurring
  visibleTo?: string
  superTeamId?: string
}

export interface CommitMeet {
  _id: string
  titleEventsFile?: string | null
  userTitle?: string | null
  startDateTime: string
  endDateTime: string
  locationDetails?: string | null
  city?: string | null
  state?: string | null
  status?: string
  course?: string
}

export interface WebsiteData2b {
  events: CommitEvent[]
  meets?: CommitMeet[]
  programs?: unknown[]
  coachesAndAdmins?: unknown[]
  clubs?: unknown[]
  recordBoards?: unknown[]
}

export interface WebsiteData2a {
  superTeam?: {
    _id: string
    name: string
    timezone?: string
  }
  websiteConfig?: unknown
  settings?: unknown
}

/**
 * Practice group id within a tenant (e.g. "Sr", "DEVO").
 * Concrete values come from each tenant's `groups` config.
 */
export type SubTeam = string

/** One labeled row of source API data for the day detail sheet. */
export interface DetailField {
  label: string
  value: string
}

export interface Occurrence {
  id: string
  sourceId: string
  name: string
  label: EventLabel
  start: Date
  end: Date
  subTeams: SubTeam[]
  location: string | null
  /** Formatted fields from the original Commit API payload. */
  fields: DetailField[]
}
