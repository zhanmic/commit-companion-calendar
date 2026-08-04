import type { CommitMeet } from '../types'
import type { PracticeNameFormat, ScheduleSettings } from '../lib/settings'

/** One filterable practice group within a tenant. */
export interface TenantGroup {
  id: string
  label: string
  /** CSS color value (usually a custom property). */
  color: string
  /** Always offer this chip even when the week has no matching practices. */
  alwaysShow?: boolean
}

export interface ParsedPracticeName {
  subTeams: string[]
  location: string | null
}

export interface ParsedMeet {
  name: string
  location: string | null
  start: Date
  end: Date
}

/** How a tenant turns a Commit practice title into group(s) + location. */
export type PracticeParser = (
  name: string,
  format: PracticeNameFormat,
) => ParsedPracticeName

/**
 * How a tenant turns a Commit meet record into display fields.
 * Return null to skip the meet entirely.
 */
export type MeetParser = (meet: CommitMeet) => ParsedMeet | null

export interface TenantLinks {
  officialCalendar?: string
  carpool?: string
}

/**
 * Full tenant definition. New teams add a module under `src/tenants/<Slug>/`
 * and register it in `registry.ts`.
 */
export interface TenantConfig {
  /** Canonical URL path segment, e.g. `DelmarDolphins` → `/DelmarDolphins`. */
  slug: string
  /**
   * Former path segments that should resolve to this tenant
   * (e.g. typo URLs). Canonical `slug` is preferred in the address bar.
   */
  slugAliases?: string[]
  displayName: string
  /** Commit Swimming super-team id used for website-data-2a/2b. */
  superTeamId: string
  defaultTimeZone: string
  /** Local hour (0–23) for daily digest emails. Default 7. */
  dailySendHour?: number
  /** Local hour (0–23) on Sunday for weekly digest emails. Default 18. */
  weeklySendHour?: number
  groups: TenantGroup[]
  /** Default schedule settings for first-time visitors. */
  defaultSettings: ScheduleSettings
  links: TenantLinks
  /** Prefix for downloaded .ics filenames. */
  icsFilenamePrefix: string
  parsePractice: PracticeParser
  parseMeet: MeetParser
  /**
   * Whether an occurrence's groups match the selected filter set.
   * Tenants can encode shared sessions (e.g. Sr/Jr) here.
   */
  occurrenceMatchesTeams: (
    teams: string[],
    selected: Set<string>,
  ) => boolean
}

export interface TenantPublicMeta {
  slug: string
  displayName: string
  path: string
}
