import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getTenantBySlug } from '../tenants.js'
import {
  buildSpoken,
  foldGroupKey,
  resolveGroup,
  resolveQueryDate,
  shiftDateKey,
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
