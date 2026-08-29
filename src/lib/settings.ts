import { isScheduleAdmin } from './admin'
import { PRODUCT_STORAGE_PREFIX } from '../product'
import type { TenantConfig } from '../tenants/types'

/** Roles for segments of a practice title split by the separator. */
export type NameField = 'group' | 'location' | 'time' | 'ignore'

export type PracticeParseMode = 'fields' | 'keywords'

export interface PracticeNameFormat {
  /** `fields` = split title by separator; `keywords` = scan whole title. */
  mode: PracticeParseMode
  /** Separator between group / location / time (default "-"). */
  separator: string
  /** Ordered meaning of each segment after splitting. */
  fields: NameField[]
}

export interface ScheduleSettings {
  /** Include calendar items with label "event" (team events, cancellations, etc.). */
  includeTeamEvents: boolean
  /** Fetch Commit meets (`includeMeets=true`) and show them on the week view. */
  queryMeets: boolean
  /** Groups selected by default when the page loads. */
  defaultGroups: string[]
  /** Whether the Event filter chip is selected on page load. */
  defaultShowEvents: boolean
  /** Whether the Meet filter chip is selected on page load. */
  defaultShowMeets: boolean
  /** How much to show in each month-view day cell. */
  monthDetailLevel: MonthDetailLevel
  /** How to parse practice titles into group + location. */
  practiceNameFormat: PracticeNameFormat
}

/** Compact marks → group/event name → name plus venue when known. */
export type MonthDetailLevel = 'dots' | 'group' | 'location'

export const MONTH_DETAIL_OPTIONS: Array<{
  value: MonthDetailLevel
  label: string
  description: string
}> = [
  {
    value: 'dots',
    label: 'Dots',
    description: 'Color marks only — most compact on a phone',
  },
  {
    value: 'group',
    label: 'Group',
    description: 'Show the group or event name in each day',
  },
  {
    value: 'location',
    label: 'Location',
    description: 'Group plus pool or venue when the schedule has one',
  },
]

export const DEFAULT_PRACTICE_NAME_FORMAT: PracticeNameFormat = {
  mode: 'fields',
  separator: '-',
  fields: ['group', 'location', 'time'],
}

export const PRACTICE_PARSE_MODE_OPTIONS: Array<{
  value: PracticeParseMode
  label: string
  description: string
}> = [
  {
    value: 'fields',
    label: 'Fields',
    description: 'Split title into group, location, then time',
  },
  {
    value: 'keywords',
    label: 'Keywords',
    description: 'Scan the whole title for group and pool names',
  },
]

export const NAME_FIELD_OPTIONS: Array<{ value: NameField; label: string }> = [
  { value: 'group', label: 'Group' },
  { value: 'location', label: 'Location' },
  { value: 'time', label: 'Time (ignore)' },
  { value: 'ignore', label: 'Ignore' },
]

function isMonthDetailLevel(value: unknown): value is MonthDetailLevel {
  return value === 'dots' || value === 'group' || value === 'location'
}

function isPracticeParseMode(value: unknown): value is PracticeParseMode {
  return value === 'fields' || value === 'keywords'
}

function isNameField(value: unknown): value is NameField {
  return (
    value === 'group' ||
    value === 'location' ||
    value === 'time' ||
    value === 'ignore'
  )
}

export function settingsStorageKey(tenantSlug: string): string {
  return `${PRODUCT_STORAGE_PREFIX}:${tenantSlug}:settings`
}

/** Legacy key from the single-tenant Delmar app — migrated once. */
const LEGACY_SETTINGS_KEY = 'delmar-schedule:settings'

function cloneSettings(settings: ScheduleSettings): ScheduleSettings {
  return {
    ...settings,
    defaultGroups: [...settings.defaultGroups],
    monthDetailLevel: settings.monthDetailLevel,
    practiceNameFormat: {
      ...settings.practiceNameFormat,
      fields: [...settings.practiceNameFormat.fields],
    },
  }
}

/**
 * Non-admins always fetch/include team events and meets.
 * Advanced toggles are admin-only in the settings UI.
 */
export function applyPublicScheduleLocks(
  settings: ScheduleSettings,
): ScheduleSettings {
  if (isScheduleAdmin()) return settings
  return {
    ...settings,
    includeTeamEvents: true,
    queryMeets: true,
  }
}

function normalizeDefaultGroups(
  value: unknown,
  tenant: TenantConfig,
): string[] {
  const order = tenant.groups.map((g) => g.id)
  const fallback = [...tenant.defaultSettings.defaultGroups]
  if (!Array.isArray(value)) return fallback
  // Preserve empty selection — empty means no groups selected on load.
  if (value.length === 0) return []
  const groups = order.filter((team) => value.includes(team))
  return groups.length ? groups : fallback
}

function normalizePracticeNameFormat(
  value: unknown,
  tenant: TenantConfig,
): PracticeNameFormat {
  const defaults = tenant.defaultSettings.practiceNameFormat
  if (!value || typeof value !== 'object') {
    return {
      ...defaults,
      fields: [...defaults.fields],
    }
  }
  const raw = value as Partial<PracticeNameFormat>
  const fields = Array.isArray(raw.fields)
    ? raw.fields.filter(isNameField)
    : defaults.fields
  return {
    mode: isPracticeParseMode(raw.mode) ? raw.mode : defaults.mode,
    separator:
      typeof raw.separator === 'string' && raw.separator.length > 0
        ? raw.separator
        : defaults.separator,
    fields: fields.length ? fields : [...defaults.fields],
  }
}

function normalizeSettings(
  parsed: Partial<ScheduleSettings>,
  tenant: TenantConfig,
): ScheduleSettings {
  const defaults = tenant.defaultSettings
  // Older saves had Event/Meet off by default and omitted these keys. On first
  // load of the new defaults UI, turn the Event/Meet chips back on.
  const hasKindDefaults =
    typeof parsed.defaultShowEvents === 'boolean' ||
    typeof parsed.defaultShowMeets === 'boolean'

  return {
    includeTeamEvents: hasKindDefaults
      ? typeof parsed.includeTeamEvents === 'boolean'
        ? parsed.includeTeamEvents
        : defaults.includeTeamEvents
      : true,
    queryMeets: hasKindDefaults
      ? typeof parsed.queryMeets === 'boolean'
        ? parsed.queryMeets
        : defaults.queryMeets
      : true,
    defaultGroups: normalizeDefaultGroups(parsed.defaultGroups, tenant),
    defaultShowEvents:
      typeof parsed.defaultShowEvents === 'boolean'
        ? parsed.defaultShowEvents
        : defaults.defaultShowEvents,
    defaultShowMeets:
      typeof parsed.defaultShowMeets === 'boolean'
        ? parsed.defaultShowMeets
        : defaults.defaultShowMeets,
    monthDetailLevel: isMonthDetailLevel(parsed.monthDetailLevel)
      ? parsed.monthDetailLevel
      : defaults.monthDetailLevel,
    practiceNameFormat: normalizePracticeNameFormat(
      parsed.practiceNameFormat,
      tenant,
    ),
  }
}

function readRawSettings(key: string): Partial<ScheduleSettings> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as Partial<ScheduleSettings>
  } catch {
    return null
  }
}

export function getStoredSettings(tenant: TenantConfig): ScheduleSettings {
  const key = settingsStorageKey(tenant.slug)
  let parsed = readRawSettings(key)

  // One-time migrations from older Delmar storage keys / typo slug.
  if (!parsed) {
    const legacyKeys = [
      ...((tenant.slugAliases ?? []).map((alias) => settingsStorageKey(alias))),
      ...(tenant.slug === 'DelmarDolfins' ||
      (tenant.slugAliases ?? []).some((a) =>
        ['DelmarDolphins', 'DelmaDolphins'].includes(a),
      )
        ? [LEGACY_SETTINGS_KEY]
        : []),
    ]
    for (const legacyKey of legacyKeys) {
      parsed = readRawSettings(legacyKey)
      if (parsed) {
        const migrated = applyPublicScheduleLocks(
          normalizeSettings(parsed, tenant),
        )
        setStoredSettings(tenant, migrated)
        return migrated
      }
    }
  }

  if (!parsed) {
    return applyPublicScheduleLocks(cloneSettings(tenant.defaultSettings))
  }
  return applyPublicScheduleLocks(normalizeSettings(parsed, tenant))
}

export function setStoredSettings(
  tenant: TenantConfig,
  settings: ScheduleSettings,
): void {
  if (typeof window === 'undefined') return
  const locked = applyPublicScheduleLocks(settings)
  localStorage.setItem(
    settingsStorageKey(tenant.slug),
    JSON.stringify(locked),
  )
}
