/**
 * Recurrence expansion must keep team-local wall times across DST, even when
 * the host process runs in UTC (Vercel). Set TZ before exercising expand.
 */
process.env.TZ = 'UTC'

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { expandEvents } from './expand.js'
import { getWeekRange } from './week.js'

const TZ = 'America/New_York'

const OPTIONS = {
  timeZone: TZ,
  practiceNameFormat: { mode: 'keywords' },
  parsePractice: (name) => ({ subTeams: [name], location: null }),
}

function localLabel(date) {
  return format(toZonedTime(date, TZ), 'yyyy-MM-dd HH:mm')
}

describe('expandEvents DST wall clock', () => {
  it('keeps Donner Senior morning at 6:00 after the Nov 2026 fall-back (UTC host)', () => {
    assert.equal(process.env.TZ, 'UTC')
    assert.equal(new Date().getTimezoneOffset(), 0)

    // Commit stores the first occurrence as an absolute UTC instant.
    // 2026-10-28T10:00Z = 6:00 AM EDT; after Nov 1 it must stay 6:00 AM EST.
    const events = [
      {
        _id: 'senior-am',
        name: 'Senior Practice',
        label: 'practice',
        startDate: '2026-10-28T10:00:00.000Z',
        endDate: '2026-10-28T11:00:00.000Z',
        recurring: {
          period: 'weekdays',
          endDate: '2026-11-07T04:59:59.999Z',
          days: [1, 3, 5],
        },
      },
    ]

    const before = getWeekRange(new Date('2026-10-25T12:00:00Z'), TZ)
    const after = getWeekRange(new Date('2026-11-01T12:00:00Z'), TZ)

    const pre = expandEvents(events, before.rangeStart, before.rangeEnd, OPTIONS)
    const post = expandEvents(events, after.rangeStart, after.rangeEnd, OPTIONS)

    assert.deepEqual(
      pre.map((o) => localLabel(o.start)),
      ['2026-10-28 06:00', '2026-10-30 06:00'],
    )
    assert.deepEqual(
      post.map((o) => localLabel(o.start)),
      ['2026-11-02 06:00', '2026-11-04 06:00', '2026-11-06 06:00'],
    )
  })

  it('keeps afternoon practices at 3:30 after the fall-back', () => {
    const events = [
      {
        _id: 'senior-pm',
        name: 'Senior Practice',
        label: 'practice',
        startDate: '2026-10-27T19:30:00.000Z',
        endDate: '2026-10-27T21:30:00.000Z',
        recurring: {
          period: 'weekdays',
          endDate: '2026-11-08T04:59:59.999Z',
          days: [1, 2, 3, 4],
        },
      },
    ]

    const after = getWeekRange(new Date('2026-11-01T12:00:00Z'), TZ)
    const post = expandEvents(events, after.rangeStart, after.rangeEnd, OPTIONS)

    assert.deepEqual(
      post.map((o) => localLabel(o.start)),
      [
        '2026-11-02 15:30',
        '2026-11-03 15:30',
        '2026-11-04 15:30',
        '2026-11-05 15:30',
      ],
    )
  })

  it('keeps wall clock when springing forward in March 2026', () => {
    // Mon Mar 2 2026 6:00 AM EST = 11:00Z; after Mar 8 → still 6:00 AM EDT.
    const events = [
      {
        _id: 'spring-am',
        name: 'Morning',
        label: 'practice',
        startDate: '2026-03-02T11:00:00.000Z',
        endDate: '2026-03-02T12:00:00.000Z',
        recurring: {
          period: 'weekdays',
          endDate: '2026-03-15T03:59:59.999Z',
          days: [1, 3, 5],
        },
      },
    ]

    const before = getWeekRange(new Date('2026-03-01T12:00:00Z'), TZ)
    const after = getWeekRange(new Date('2026-03-08T12:00:00Z'), TZ)

    const pre = expandEvents(events, before.rangeStart, before.rangeEnd, OPTIONS)
    const post = expandEvents(events, after.rangeStart, after.rangeEnd, OPTIONS)

    assert.deepEqual(
      pre.map((o) => localLabel(o.start)),
      ['2026-03-02 06:00', '2026-03-04 06:00', '2026-03-06 06:00'],
    )
    assert.deepEqual(
      post.map((o) => localLabel(o.start)),
      ['2026-03-09 06:00', '2026-03-11 06:00', '2026-03-13 06:00'],
    )
  })
})
