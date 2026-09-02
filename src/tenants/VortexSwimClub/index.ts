import type { ScheduleSettings } from '../../lib/settings'
import type { TenantConfig } from '../types'
import {
  VORTEX_GROUPS,
  VORTEX_NAMED_GROUP_IDS,
  vortexOccurrenceMatchesTeams,
} from './groups'
import { parseVortexMeet } from './parseMeet'
import { parseVortexPractice } from './parsePractice'

const DEFAULT_SETTINGS: ScheduleSettings = {
  includeTeamEvents: true,
  queryMeets: true,
  defaultGroups: [...VORTEX_NAMED_GROUP_IDS],
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
 * Vortex Swim Club (Colorado) — Commit site teamvortex.org.
 * Path: /VortexSwimClub
 */
export const vortexSwimClubTenant: TenantConfig = {
  slug: 'VortexSwimClub',
  slugAliases: ['TeamVortex', 'Vortex'],
  displayName: 'Vortex Swim Club',
  superTeamId: 'WNP4xfPJL67a6k2Np',
  /** Mountain — daily digests 7 a.m. MT, weekly Sunday 6 p.m. MT. */
  defaultTimeZone: 'America/Denver',
  dailySendHour: 7,
  weeklySendHour: 18,
  groups: VORTEX_GROUPS,
  defaultSettings: DEFAULT_SETTINGS,
  links: {
    officialCalendar: 'https://www.teamvortex.org/practice_times',
  },
  icsFilenamePrefix: 'vortex-swim-club',
  parsePractice: parseVortexPractice,
  parseMeet: parseVortexMeet,
  occurrenceMatchesTeams: vortexOccurrenceMatchesTeams,
  // After Stripe Checkout: billingStatus: 'active', stripeCustomerId: 'cus_…'
}
