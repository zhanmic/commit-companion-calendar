import type { ScheduleSettings } from '../../lib/settings'
import type { TenantConfig } from '../types'
import {
  VERNON_HILLS_GROUPS,
  VERNON_HILLS_NAMED_GROUP_IDS,
  vernonHillsOccurrenceMatchesTeams,
} from './groups'
import { parseVernonHillsMeet } from './parseMeet'
import { parseVernonHillsPractice } from './parsePractice'

const DEFAULT_SETTINGS: ScheduleSettings = {
  includeTeamEvents: true,
  queryMeets: true,
  defaultGroups: [...VERNON_HILLS_NAMED_GROUP_IDS],
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
 * Vernon Hills Swim Team - Turtles (Vernon Hills, IL).
 * Public path: /4
 */
export const vernonHillsTurtlesTenant: TenantConfig = {
  slug: 'VernonHillsTurtles',
  shortSlug: '4',
  slugAliases: ['VHTurtles', 'VHST'],
  displayName: 'Vernon Hills Turtles',
  superTeamId: '6BvqcZJXmLNmAW6gi',
  /** Central — daily digests 7 a.m. CT, weekly Sunday 6 p.m. CT. */
  defaultTimeZone: 'America/Chicago',
  dailySendHour: 7,
  weeklySendHour: 18,
  groups: VERNON_HILLS_GROUPS,
  defaultSettings: DEFAULT_SETTINGS,
  links: {
    officialCalendar: 'https://www.vhturtlesswimteam.org/practice-calendar',
  },
  icsFilenamePrefix: 'vernon-hills-turtles',
  parsePractice: parseVernonHillsPractice,
  parseMeet: parseVernonHillsMeet,
  occurrenceMatchesTeams: vernonHillsOccurrenceMatchesTeams,
}
