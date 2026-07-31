import type { ScheduleSettings } from '../../lib/settings'
import type { TenantConfig } from '../types'
import {
  DELMA_GROUPS,
  delmaOccurrenceMatchesTeams,
} from './groups'
import { parseDelmaMeet } from './parseMeet'
import { parseDelmaPractice } from './parsePractice'

const DEFAULT_SETTINGS: ScheduleSettings = {
  includeTeamEvents: true,
  queryMeets: true,
  defaultGroups: ['Sr'],
  defaultShowEvents: false,
  defaultShowMeets: false,
  practiceNameFormat: {
    mode: 'fields',
    separator: '-',
    fields: ['group', 'location', 'time'],
  },
}

/**
 * First My Swim Day tenant.
 * Path: /DelmarDolphins
 */
export const delmarDolphinsTenant: TenantConfig = {
  slug: 'DelmarDolphins',
  slugAliases: ['DelmaDolphins'],
  displayName: 'Delmar Dolphins',
  superTeamId: 'g8g7f3rkF8N23vXs4',
  defaultTimeZone: 'America/New_York',
  groups: DELMA_GROUPS,
  defaultSettings: DEFAULT_SETTINGS,
  links: {
    officialCalendar: 'https://www.delmardolfins.com/schedule',
    carpool: 'https://swim-carpool.vercel.app',
  },
  icsFilenamePrefix: 'delmar-dolphins',
  parsePractice: parseDelmaPractice,
  parseMeet: parseDelmaMeet,
  occurrenceMatchesTeams: delmaOccurrenceMatchesTeams,
}

/** @deprecated Use `delmarDolphinsTenant`. */
export const delmaDolphinsTenant = delmarDolphinsTenant
