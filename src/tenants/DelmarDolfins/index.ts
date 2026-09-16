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
  monthDetailLevel: 'dots',
  practiceNameFormat: {
    mode: 'fields',
    separator: '-',
    fields: ['group', 'location', 'time'],
  },
}

/**
 * First My Swim Day tenant.
 * Public path: /1 (long names remain aliases).
 */
export const delmarDolfinsTenant: TenantConfig = {
  slug: 'DelmarDolfins',
  shortSlug: '1',
  slugAliases: [
    'DelmarDolphins',
    'DelmaDolphins',
    'DelmarDolfin',
    'DelmarDolphin',
  ],
  displayName: 'Delmar Dolfins',
  superTeamId: 'g8g7f3rkF8N23vXs4',
  /** New York — daily digests 7 a.m. ET, weekly Sunday 6 p.m. ET. */
  defaultTimeZone: 'America/New_York',
  dailySendHour: 7,
  weeklySendHour: 18,
  groups: DELMA_GROUPS,
  defaultSettings: DEFAULT_SETTINGS,
  links: {
    officialCalendar: 'https://www.delmardolfins.com/schedule',
    carpool: 'https://swim-carpool.vercel.app',
  },
  icsFilenamePrefix: 'delmar-dolfins',
  parsePractice: parseDelmaPractice,
  parseMeet: parseDelmaMeet,
  occurrenceMatchesTeams: delmaOccurrenceMatchesTeams,
  // After Stripe Checkout: billingStatus: 'active', stripeCustomerId: 'cus_…'
}

/** @deprecated Use `delmarDolfinsTenant`. */
export const delmarDolphinsTenant = delmarDolfinsTenant

/** @deprecated Use `delmarDolfinsTenant`. */
export const delmaDolphinsTenant = delmarDolfinsTenant
