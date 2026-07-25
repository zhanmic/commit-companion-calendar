import type { NameField, PracticeNameFormat } from './settings'
import type { ParsedPracticeName } from '../tenants/types'

/** Tenant-supplied keyword scanners for group + location. */
export interface GroupLocationParsers {
  parseSubTeams: (name: string) => string[]
  parseLocation: (name: string) => string | null
}

/** Split a title on the configured separator and drop empty segments. */
export function splitNameParts(name: string, separator: string): string[] {
  const sep = separator || '-'
  const escaped = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return name
    .split(new RegExp(`\\s*${escaped}\\s*`))
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * Merge accidental group splits created by the separator:
 * "Jr- Prep- BCMS" → group "Jr Prep", rest ["BCMS"]
 * "Sr-Jr- Academy" → group "Sr/Jr", rest ["Academy"]
 */
function coalesceGroupParts(parts: string[]): {
  groupText: string
  rest: string[]
} {
  if (parts.length === 0) return { groupText: '', rest: [] }

  let groupText = parts[0]
  let index = 1

  const first = parts[0].toLowerCase()
  const second = parts[1]?.toLowerCase() ?? ''

  if (
    index < parts.length &&
    /^(jr|junior)$/.test(first) &&
    /^prep\b/.test(second)
  ) {
    groupText = `${parts[0]} ${parts[1]}`
    index = 2
  } else if (
    index < parts.length &&
    /^(sr|senior)$/.test(first) &&
    /^(jr|junior)$/.test(second)
  ) {
    groupText = `${parts[0]}/${parts[1]}`
    index = 2
  }

  return { groupText, rest: parts.slice(index) }
}

function cleanLocationText(raw: string): string {
  // Drop trailing clock fragments that leaked into the location segment.
  return raw
    .replace(/\b\d{1,2}([:.]\d{2})?\s*(am|pm)\b.*$/i, '')
    .replace(/\b\d{1,2}([:.]\d{2})\b.*$/i, '')
    .trim()
}

function mapPartsToFields(
  parts: string[],
  fields: NameField[],
): Partial<Record<'group' | 'location', string>> {
  const mapped: Partial<Record<'group' | 'location', string>> = {}
  let partIndex = 0

  for (const field of fields) {
    if (partIndex >= parts.length) break
    const value = parts[partIndex]
    partIndex += 1

    if (field === 'time' || field === 'ignore') continue
    mapped[field] = value
  }

  return mapped
}

/** Keyword scan of the full title (legacy behavior). */
export function parsePracticeNameKeywords(
  name: string,
  parsers: GroupLocationParsers,
): ParsedPracticeName {
  return {
    subTeams: parsers.parseSubTeams(name),
    location: parsers.parseLocation(name),
  }
}

/**
 * Field parser: Group / Location / Time using a configurable separator.
 * Time segments are ignored because start/end come from Commit fields.
 */
export function parsePracticeNameFields(
  name: string,
  format: PracticeNameFormat,
  parsers: GroupLocationParsers,
): ParsedPracticeName {
  const parts = splitNameParts(name, format.separator)
  if (parts.length === 0) {
    return { subTeams: ['Other'], location: null }
  }

  const fields = format.fields.length
    ? format.fields
    : (['group', 'location', 'time'] as NameField[])

  // Prefer coalescing group tokens before assigning fields when group is first.
  let workingParts = parts
  if (fields[0] === 'group') {
    const coalesced = coalesceGroupParts(parts)
    workingParts = [coalesced.groupText, ...coalesced.rest].filter(Boolean)
  }

  const mapped = mapPartsToFields(workingParts, fields)
  const groupText = mapped.group ?? workingParts[0] ?? name
  const locationRaw = mapped.location ?? null

  // Keep the full location segment (e.g. "Elm Ave Long Course") rather than
  // collapsing it to a canonical pool label, so descriptors aren't filtered out.
  const cleaned = locationRaw ? cleanLocationText(locationRaw) : ''
  const locationFromField = cleaned || null

  return {
    subTeams: parsers.parseSubTeams(groupText),
    location: locationFromField ?? parsers.parseLocation(name),
  }
}
