import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getTenantBySlug } from '../tenants.js'
import {
  buildSpoken,
  foldGroupKey,
  resolveGroup,
  resolveGroups,
  resolveQueryDate,
  shiftDateKey,
  splitGroupTokens,
} from './publicQuery.js'
import {
  estimatedHouseholds,
  evaluateCounters,
  ipHourlyLimit,
  teamHourlyLimit,
} from './rateLimit.js'

const delmar = getTenantBySlug('DelmarDolfins')
const vortex = getTenantBySlug('VortexSwimClub')

describe('resolveGroup', () => {
  it('maps senior to Delmar Sr', () => {
    const { group, error } = resolveGroup(delmar, 'senior')
    assert.equal(error, undefined)
    assert.equal(group.id, 'Sr')
  })

  it('maps Junior Prep to Jr Prep', () => {
    const { group } = resolveGroup(delmar, 'Junior Prep')
    assert.equal(group.id, 'Jr Prep')
  })

  it('maps Delmar Dolphins alias team groups', () => {
    const tenant = getTenantBySlug('DelmarDolphins')
    const { group } = resolveGroup(tenant, 'Sr')
    assert.equal(group.id, 'Sr')
  })

  it('rejects unknown groups with the catalog', () => {
    const { error, groups } = resolveGroup(delmar, 'Masters')
    assert.match(error, /Unknown group/)
    assert.ok(groups.some((g) => g.id === 'Sr'))
  })

  it('maps Peak for Vortex without stealing Delmar aliases', () => {
    const { group } = resolveGroup(vortex, 'peak')
    assert.equal(group.id, 'Peak')
  })

  it('folds punctuation in group names', () => {
    assert.equal(foldGroupKey('Jr Prep'), 'jrprep')
    const { group } = resolveGroup(delmar, 'jr-prep')
    assert.equal(group.id, 'Jr Prep')
  })

  it('resolves two groups from a comma list', () => {
    const { groups, error } = resolveGroups(delmar, 'Sr,Jr')
    assert.equal(error, undefined)
    assert.deepEqual(
      groups.map((g) => g.id),
      ['Sr', 'Jr'],
    )
  })

  it('resolves senior and junior as two groups', () => {
    const { groups } = resolveGroups(delmar, 'senior and junior')
    assert.deepEqual(
      groups.map((g) => g.id),
      ['Sr', 'Jr'],
    )
  })

  it('keeps Jr Prep together when listed with Sr', () => {
    const { groups } = resolveGroups(delmar, 'Jr Prep,Sr')
    assert.deepEqual(
      groups.map((g) => g.id),
      ['Jr Prep', 'Sr'],
    )
  })

  it('dedupes repeated groups', () => {
    const { groups } = resolveGroups(delmar, 'Sr,senior')
    assert.deepEqual(
      groups.map((g) => g.id),
      ['Sr'],
    )
  })
})

describe('splitGroupTokens', () => {
  it('does not split Jr Prep on spaces', () => {
    assert.deepEqual(splitGroupTokens('Jr Prep,Sr'), ['Jr Prep', 'Sr'])
  })
})

describe('resolveQueryDate', () => {
  const tz = 'America/New_York'
  // 2:30am UTC on Sep 16 is still Sep 15 in Eastern.
  const lateEt = new Date('2026-09-16T02:30:00Z')

  it('uses the team timezone for today', () => {
    const range = resolveQueryDate('today', tz, lateEt)
    assert.equal(range.dayKey, '2026-09-15')
    assert.equal(range.relative, 'today')
  })

  it('resolves tomorrow in the team timezone', () => {
    const range = resolveQueryDate('tomorrow', tz, lateEt)
    assert.equal(range.dayKey, '2026-09-16')
    assert.equal(range.relative, 'tomorrow')
  })

  it('accepts an explicit calendar date', () => {
    const range = resolveQueryDate('2026-09-18', tz, lateEt)
    assert.equal(range.dayKey, '2026-09-18')
    assert.equal(range.relative, 'date')
    assert.match(range.label, /Friday/)
  })

  it('rejects impossible calendar days', () => {
    const range = resolveQueryDate('2026-02-31', tz, lateEt)
    assert.match(range.error, /Invalid date/)
  })

  it('keeps an explicit calendar date in the spoken sentence', () => {
    const range = resolveQueryDate('2026-09-15', tz, lateEt)
    assert.equal(range.relative, 'date')
    assert.equal(range.dayKey, '2026-09-15')
  })

  it('resolves this Friday as Friday of the current team week', () => {
    const range = resolveQueryDate('this Friday', tz, lateEt)
    assert.equal(range.dayKey, '2026-09-18')
    assert.equal(range.relative, 'this Friday')
  })

  it('resolves next Monday as Monday of next week', () => {
    const range = resolveQueryDate('next Monday', tz, lateEt)
    assert.equal(range.dayKey, '2026-09-21')
    assert.equal(range.relative, 'next Monday')
  })

  it('resolves a bare Friday as the upcoming Friday', () => {
    const range = resolveQueryDate('Friday', tz, lateEt)
    assert.equal(range.dayKey, '2026-09-18')
    assert.equal(range.relative, 'Friday')
  })

  it('treats this Monday as this week even when that day has passed', () => {
    const range = resolveQueryDate('this Monday', tz, lateEt)
    assert.equal(range.dayKey, '2026-09-14')
    assert.equal(range.relative, 'this Monday')
  })

  it('accepts hyphenated and abbreviated phrases', () => {
    const hyphen = resolveQueryDate('this-Friday', tz, lateEt)
    const abbrev = resolveQueryDate('next mon', tz, lateEt)
    const coming = resolveQueryDate('coming Friday', tz, lateEt)
    assert.equal(hyphen.dayKey, '2026-09-18')
    assert.equal(abbrev.dayKey, '2026-09-21')
    assert.equal(coming.dayKey, '2026-09-18')
  })

  it('on Saturday, this Friday is last Friday and Friday is next week', () => {
    const saturday = new Date('2026-09-20T02:00:00Z') // Saturday Sep 19 ET
    const thisFri = resolveQueryDate('this Friday', tz, saturday)
    const upcomingFri = resolveQueryDate('Friday', tz, saturday)
    const nextMon = resolveQueryDate('next Monday', tz, saturday)
    assert.equal(thisFri.dayKey, '2026-09-18')
    assert.equal(upcomingFri.dayKey, '2026-09-25')
    assert.equal(nextMon.dayKey, '2026-09-21')
  })
})

describe('shiftDateKey', () => {
  it('crosses month boundaries', () => {
    assert.equal(shiftDateKey('2026-09-30', 1), '2026-10-01')
    assert.equal(shiftDateKey('2026-03-01', -1), '2026-02-28')
  })
})

describe('buildSpoken', () => {
  it('describes a single practice', () => {
    const text = buildSpoken({
      teamName: 'Delmar Dolfins',
      groupLabel: 'Sr',
      relative: 'today',
      dateLabel: 'Tuesday, Sep 16',
      sessions: [
        {
          startTime: '5:30 AM',
          endTime: '7:00 AM',
          location: 'BCHS',
        },
      ],
    })
    assert.equal(
      text,
      'Sr practice for Delmar Dolfins today is 5:30 AM to 7:00 AM at BCHS.',
    )
  })

  it('lists multiple sessions', () => {
    const text = buildSpoken({
      teamName: 'Delmar Dolfins',
      groupLabel: 'Sr',
      relative: 'tomorrow',
      dateLabel: 'Wednesday, Sep 17',
      sessions: [
        { startTime: '5:30 AM', endTime: '7:00 AM', location: 'BCHS' },
        { startTime: '4:00 PM', endTime: '5:30 PM', location: 'Elm Ave' },
      ],
    })
    assert.match(text, /5:30 AM to 7:00 AM at BCHS/)
    assert.match(text, /and 4:00 PM to 5:30 PM at Elm Ave/)
  })

  it('handles an empty day', () => {
    const text = buildSpoken({
      teamName: 'Delmar Dolfins',
      groupLabel: 'Sr',
      relative: 'date',
      dateLabel: 'Sunday, Sep 20',
      sessions: [],
    })
    assert.equal(
      text,
      'There is no Sr practice for Delmar Dolfins on Sunday, Sep 20.',
    )
  })

  it('uses this Friday in the spoken sentence', () => {
    const text = buildSpoken({
      teamName: 'Delmar Dolfins',
      groupLabel: 'Sr',
      relative: 'this Friday',
      dateLabel: 'Friday, Sep 18',
      sessions: [
        { startTime: '6:00 PM', endTime: '8:00 PM', location: 'Albany Academy' },
      ],
    })
    assert.equal(
      text,
      'Sr practice for Delmar Dolfins this Friday is 6:00 PM to 8:00 PM at Albany Academy.',
    )
  })

  it('names each session when two groups are asked', () => {
    const text = buildSpoken({
      teamName: 'Delmar Dolfins',
      groupLabel: 'Sr and Jr',
      relative: 'today',
      dateLabel: 'Tuesday, Sep 16',
      sessions: [
        {
          startTime: '6:00 PM',
          endTime: '8:00 PM',
          location: 'Albany Academy',
          groups: ['Sr'],
        },
        {
          startTime: '5:00 PM',
          endTime: '6:00 PM',
          location: 'BCHS',
          groups: ['Jr'],
        },
      ],
    })
    assert.match(text, /Sr and Jr practice/)
    assert.match(text, /Sr, 6:00 PM to 8:00 PM at Albany Academy/)
    assert.match(text, /Jr, 5:00 PM to 6:00 PM at BCHS/)
  })
})

describe('rate limits scale with team size', () => {
  it('gives Delmar a lower hourly cap than Vortex', () => {
    const delmarLimit = teamHourlyLimit(delmar)
    const vortexLimit = teamHourlyLimit(vortex)
    assert.ok(delmarLimit >= 120)
    assert.ok(vortexLimit > delmarLimit)
    assert.equal(estimatedHouseholds(delmar), 6 * 35)
    assert.equal(estimatedHouseholds(vortex), 10 * 35)
  })

  it('honors publicApiHouseholds overrides', () => {
    const tiny = teamHourlyLimit({ groups: [{ id: 'Sr' }], publicApiHouseholds: 10 })
    assert.equal(tiny, 120)
    const large = teamHourlyLimit({
      groups: [{ id: 'Sr' }],
      publicApiHouseholds: 800,
    })
    assert.equal(large, 800 * 4)
  })

  it('opens the team circuit when traffic exceeds the cap', () => {
    const teamLimit = teamHourlyLimit(delmar)
    const tripped = evaluateCounters({
      teamCount: teamLimit + 1,
      ipCount: 1,
      teamLimit,
      ipLimit: ipHourlyLimit(delmar),
    })
    assert.equal(tripped.allowed, false)
    assert.equal(tripped.code, 'team_circuit')

    const ok = evaluateCounters({
      teamCount: 3,
      ipCount: 1,
      teamLimit,
      ipLimit: ipHourlyLimit(delmar),
    })
    assert.equal(ok.allowed, true)
  })
})
