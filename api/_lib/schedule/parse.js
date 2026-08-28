/** Delmar (+ shared) practice title parsing for serverless digests. */

export function parseDelmaSubTeams(name) {
  const lower = name.trim().toLowerCase()

  if (
    /\bjr\s*prep\b/.test(lower) ||
    /\bjrprep\b/.test(lower) ||
    /\bjunior\s*prep\b/.test(lower)
  ) {
    return ['Jr Prep']
  }

  if (/\bdevo\b/.test(lower) || /\bdevelopmental\b/.test(lower)) {
    return ['DEVO']
  }

  const hasSr = /\bsr\b/.test(lower) || /\bsenior\b/.test(lower)
  const hasJr = /\bjr\b/.test(lower) || /\bjunior\b/.test(lower)

  if (hasSr && hasJr) return ['Sr/Jr']
  if (hasSr) return ['Sr']
  if (hasJr) return ['Jr']

  return ['Other']
}

const LOCATION_PATTERNS = [
  { match: /\belm\b|\belm\s*ave\b/i, label: 'Elm Ave' },
  { match: /\bbchs\b/i, label: 'BCHS' },
  { match: /\bbcms\b/i, label: 'BCMS' },
  { match: /\bacademy\b|\b\baa\b/i, label: 'Academy' },
  { match: /albany country club/i, label: 'Albany Country Club' },
  { match: /\brpi\b/i, label: 'RPI' },
]

export function parseDelmaLocation(name) {
  for (const { match, label } of LOCATION_PATTERNS) {
    if (match.test(name)) return label
  }
  return null
}

export function delmaOccurrenceMatchesTeams(teams, selected) {
  if (selected.size === 0) return false
  if (teams.some((t) => selected.has(t))) return true
  if (teams.includes('Sr/Jr') && (selected.has('Sr') || selected.has('Jr'))) {
    return true
  }
  return false
}

function splitNameParts(name, separator) {
  const sep = separator || '-'
  const escaped = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return name
    .split(new RegExp(`\\s*${escaped}\\s*`))
    .map((part) => part.trim())
    .filter(Boolean)
}

function coalesceGroupParts(parts) {
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

function cleanLocationText(raw) {
  return raw
    .replace(/\b\d{1,2}([:.]\d{2})?\s*(am|pm)\b.*$/i, '')
    .replace(/\b\d{1,2}([:.]\d{2})\b.*$/i, '')
    .trim()
}

function mapPartsToFields(parts, fields) {
  const mapped = {}
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

export function parsePracticeName(name, format, parsers) {
  if (format?.mode === 'keywords') {
    return {
      subTeams: parsers.parseSubTeams(name),
      location: parsers.parseLocation(name),
    }
  }

  const parts = splitNameParts(name, format?.separator || '-')
  if (parts.length === 0) {
    return { subTeams: ['Other'], location: null }
  }

  const fields =
    format?.fields?.length > 0
      ? format.fields
      : ['group', 'location', 'time']

  let workingParts = parts
  if (fields[0] === 'group') {
    const coalesced = coalesceGroupParts(parts)
    workingParts = [coalesced.groupText, ...coalesced.rest].filter(Boolean)
  }

  const mapped = mapPartsToFields(workingParts, fields)
  const groupText = mapped.group ?? workingParts[0] ?? name
  const locationRaw = mapped.location ?? null
  const cleaned = locationRaw ? cleanLocationText(locationRaw) : ''
  const locationFromField = cleaned || null

  return {
    subTeams: parsers.parseSubTeams(groupText),
    location: locationFromField ?? parsers.parseLocation(name),
  }
}

export function parseVortexSubTeams(name) {
  let scan = name.trim().toLowerCase()
  const found = new Set()

  if (/\bsenior\s+groups?\b/.test(scan)) {
    found.add('Peak')
    found.add('Elite')
    found.add('Prep')
    scan = scan.replace(/\bsenior\s+groups?\b/g, ' ')
  }

  if (/\belite\s*prep\b/.test(scan)) {
    found.add('Prep')
    scan = scan.replace(/\belite\s*prep\b/g, ' ')
  }

  if (/\bpeak\b/.test(scan)) found.add('Peak')
  if (/\belite\b/.test(scan)) found.add('Elite')
  if (/\bprep\b/.test(scan)) found.add('Prep')
  if (/\bage\s*groups?\b/.test(scan)) found.add('Age Group')
  if (/\bstorm\b|\bstrom\b/.test(scan)) found.add('Storm')
  if (/\bcyclone\b/.test(scan)) found.add('Cyclone')
  if (/\bhail\b/.test(scan)) found.add('Hail')
  if (/\blightning\b/.test(scan)) found.add('Lightning')
  if (/\bthunder\b/.test(scan)) found.add('Thunder')

  const order = [
    'Peak',
    'Elite',
    'Prep',
    'Age Group',
    'Storm',
    'Cyclone',
    'Hail',
    'Lightning',
    'Thunder',
  ]
  if (found.size === 0) return ['Other']
  return order.filter((id) => found.has(id))
}

const VORTEX_LOCATION_PATTERNS = [
  { match: /\bmulberry\b/i, label: 'Mulberry' },
  { match: /\bepic\b/i, label: 'EPIC' },
  { match: /\braintree\b/i, label: 'Raintree' },
]

export function parseVortexLocation(text) {
  for (const { match, label } of VORTEX_LOCATION_PATTERNS) {
    if (match.test(text)) return label
  }
  return null
}

export function vortexOccurrenceMatchesTeams(teams, selected) {
  if (selected.size === 0) return false
  return teams.some((t) => selected.has(t))
}

export function parseMeet(meet) {
  const start = new Date(meet.startDateTime)
  const end = new Date(meet.endDateTime)
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

/** Tenant-specific parsing hooks used by expand/digest. */
export function getTenantParsers(tenant) {
  if (tenant.slug === 'DelmarDolfins' || tenant.slug === 'DelmarDolphins') {
    return {
      parsePractice: (name, format) =>
        parsePracticeName(name, format, {
          parseSubTeams: parseDelmaSubTeams,
          parseLocation: parseDelmaLocation,
        }),
      parseMeet,
      occurrenceMatchesTeams: delmaOccurrenceMatchesTeams,
    }
  }

  if (tenant.slug === 'VortexSwimClub') {
    return {
      parsePractice: (name, _format, context) => {
        const locationSource = [name, context?.description]
          .filter(Boolean)
          .join(' ')
        return {
          subTeams: parseVortexSubTeams(name),
          location: parseVortexLocation(locationSource),
        }
      },
      parseMeet,
      occurrenceMatchesTeams: vortexOccurrenceMatchesTeams,
    }
  }

  return {
    parsePractice: () => ({
      subTeams: ['Other'],
      location: null,
    }),
    parseMeet,
    occurrenceMatchesTeams: (teams, selected) =>
      selected.size > 0 && teams.some((t) => selected.has(t)),
  }
}
