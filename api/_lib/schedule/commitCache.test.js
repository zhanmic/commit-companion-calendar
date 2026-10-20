import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { slimSchedule } from './commitCache.js'
import { expandScheduleDay } from './publicQuery.js'
import { getTenantBySlug } from '../tenants.js'

const tenant = getTenantBySlug('DelmarDolfins')
const TZ = 'America/New_York'
const OCT_5_MIDNIGHT = Date.parse('2026-10-05T04:00:00.000Z')
const OCT_12_MIDNIGHT = Date.parse('2026-10-12T04:00:00.000Z')

const RANGE = {
  rangeStart: new Date('2026-10-05T04:00:00.000Z'),
  rangeEnd: new Date('2026-10-19T04:00:00.000Z'),
}

/** Fat Commit dump: unused blobs plus a cancelled Monday and a renamed one. */
const FAT_SCHEDULE = {
  programs: [{ _id: 'program', name: 'Senior', description: 'x'.repeat(5000) }],
  coachesAndAdmins: [{ _id: 'coach', name: 'Coach' }],
  recordBoards: [{ _id: 'board', swimmers: [{ name: 'Swimmer', time: '22.00' }] }],
  clubs: [{ _id: 'club' }],
  events: [
    {
      _id: 'practice-series',
      label: 'practice',
      name: 'Sr - Elm Ave',
      description: 'Lane 1',
      superTeamId: 'team',
      startDate: '2026-10-05T21:00:00.000Z',
      endDate: '2026-10-05T22:30:00.000Z',
      attachments: [{ url: 'https://example.test/file' }],
      invitees: ['swimmer-1'],
      recurring: {
        endDate: '2026-12-31T21:00:00.000Z',
        days: [1],
        period: 'weekdays',
        ignored: true,
        custom: [
          { id: OCT_5_MIDNIGHT, removed: true, note: 'pool closed' },
          {
            id: OCT_12_MIDNIGHT,
            removed: false,
            startTime: '2026-10-12T20:00:00.000Z',
            endTime: '2026-10-12T21:00:00.000Z',
            name: 'Sr - BCHS',
            note: 'moved',
          },
        ],
      },
    },
    {
      _id: 'team-social',
      label: 'event',
      name: 'Pasta dinner',
      description: 'Bring a dish',
      startDate: '2026-10-06T22:00:00.000Z',
      endDate: '2026-10-07T00:00:00.000Z',
      respondedYes: ['a'],
    },
  ],
  meets: [
    {
      _id: 'invite',
      userTitle: 'October Invite',
      titleEventsFile: 'events.pdf',
      startDateTime: '2026-10-10T14:00:00.000Z',
      endDateTime: '2026-10-11T20:00:00.000Z',
      locationDetails: 'Elm Ave',
      city: 'Delmar',
      state: 'NY',
      notes: 'Warmup at 8',
      attachments: [{ url: 'https://example.test/meet' }],
      athleteSurcharge: 12,
    },
  ],
}

function stamp(occurrences) {
  return occurrences.map((occ) => ({
    id: occ.id,
    name: occ.name,
    label: occ.label,
    start: occ.start.toISOString(),
    end: occ.end.toISOString(),
    subTeams: occ.subTeams,
    location: occ.location,
  }))
}

describe('slimSchedule', () => {
  it('drops unused Commit blobs and keeps expansion fields', () => {
    const slim = slimSchedule(FAT_SCHEDULE)
    assert.deepEqual(Object.keys(slim).sort(), ['events', 'meets'])
    assert.equal(slim.events[0].description, 'Lane 1')
    assert.equal(slim.events[0].attachments, undefined)
    assert.equal(slim.events[0].recurring.ignored, undefined)
    assert.equal(slim.events[0].recurring.custom[0].removed, true)
    assert.equal(slim.events[0].recurring.custom[0].note, undefined)
    assert.equal(slim.events[0].recurring.custom[1].name, 'Sr - BCHS')
    assert.equal(slim.meets[0].notes, undefined)
    assert.equal(slim.meets[0].userTitle, 'October Invite')
    assert.equal(slim.meets[0].city, 'Delmar')
  })

  it('expands a fat dump and its projection to the same occurrences', () => {
    const full = expandScheduleDay(tenant, FAT_SCHEDULE, TZ, RANGE)
    const slim = expandScheduleDay(
      tenant,
      slimSchedule(FAT_SCHEDULE),
      TZ,
      RANGE,
    )
    const stamped = stamp(slim.occurrences)
    assert.deepEqual(stamped, stamp(full.occurrences))
    assert.equal(stamped.some((occ) => occ.id.startsWith('practice-series-')), true)
    assert.equal(
      stamped.some((occ) => occ.start === '2026-10-05T21:00:00.000Z'),
      false,
    )
    assert.equal(
      stamped.some(
        (occ) =>
          occ.name === 'Sr - BCHS' && occ.start === '2026-10-12T20:00:00.000Z',
      ),
      true,
    )
    assert.equal(stamped.some((occ) => occ.label === 'meet'), true)
    assert.equal(stamped.some((occ) => occ.label === 'event'), true)
  })
})
