import type { ScheduleSettings } from '../../lib/settings'
import type { TenantConfig } from '../types'
import {
  DONNER_GROUPS,
  DONNER_NAMED_GROUP_IDS,
  donnerOccurrenceMatchesTeams,
} from './groups'
import { parseDonnerMeet } from './parseMeet'
import { parseDonnerPractice } from './parsePractice'

const DEFAULT_SETTINGS: ScheduleSettings = {
  includeTeamEvents: true,
  queryMeets: true,
  defaultGroups: [...DONNER_NAMED_GROUP_IDS],
  defaultShowEvents: false,
  defaultShowMeets: false,
  monthDetailLevel: 'dots',
  practiceNameFormat: {
    mode: 'keywords',
    separator: '-',
    fields: ['group', 'location', 'time'],
  },
}

/**
 * Donner Swim Club (Columbus, IN) — Commit site donnerswimclub.com.
 * Public path: /3
 */
export const donnerSwimClubTenant: TenantConfig = {
  slug: 'DonnerSwimClub',
  shortSlug: '3',
  slugAliases: ['Donner', 'DSC'],
  displayName: 'Donner Swim Club',
  superTeamId: 'ejPNpYDhMg53othu4',
  /** Eastern — daily digests 7 a.m. ET, weekly Sunday 6 p.m. ET. */
  defaultTimeZone: 'America/New_York',
  dailySendHour: 7,
  weeklySendHour: 18,
  groups: DONNER_GROUPS,
  defaultSettings: DEFAULT_SETTINGS,
  links: {
    officialCalendar: 'https://www.donnerswimclub.com/team-practice-schedule',
  },
  icsFilenamePrefix: 'donner-swim-club',
  parsePractice: parseDonnerPractice,
  parseMeet: parseDonnerMeet,
  occurrenceMatchesTeams: donnerOccurrenceMatchesTeams,
}
