import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildIcsCalendar,
  escapeIcsText,
  feedCalendarName,
  icsFilename,
  occurrenceSummary,
} from './ics.js'
import { getHorizonRange } from './week.js'

describe('escapeIcsText', () => {
  it('escapes commas, semicolons, and newlines', () => {
    assert.equal(escapeIcsText('Sr, Jr'), 'Sr\\, Jr')
    assert.equal(escapeIcsText('a;b\nc'), 'a\\;b\\nc')
  })
})

describe('occurrenceSummary', () => {
  it('names a practice by group', () => {
    assert.equal(
      occurrenceSummary({
        label: 'practice',
        name: 'Senior Group - Albany Academy',
        subTeams: ['Sr'],
      }),
      'Sr Practice',
    )
  })

  it('uses the meet title', () => {
    assert.equal(
      occurrenceSummary({
        label: 'meet',
        name: 'Starfish Invitational',
        subTeams: [],
      }),
      'Starfish Invitational',
    )
  })
})

describe('buildIcsCalendar', () => {
  it('emits a subscribe-ready VCALENDAR with stable UIDs', () => {
    const start = new Date('2026-09-16T22:00:00Z')
    const end = new Date('2026-09-17T00:00:00Z')
    const ics = buildIcsCalendar(
      [
        {
          id: 'evt-1-123',
          label: 'practice',
          name: 'Senior Group - Albany Academy',
          subTeams: ['Sr'],
          location: 'Albany Academy',
          start,
          end,
        },
      ],
      {
        calendarName: 'Delmar Dolfins · Sr',
        timeZone: 'America/New_York',
        sourceLabel: 'Delmar Dolfins · My Swim Day',
        calendarUrl: 'https://myswimday.com/1',
        subscribe: true,
      },
    )
    assert.match(ics, /BEGIN:VCALENDAR/)
    assert.match(ics, /END:VCALENDAR/)
    assert.match(ics, /REFRESH-INTERVAL;VALUE=DURATION:PT6H/)
    assert.match(ics, /X-WR-CALNAME:Delmar Dolfins · Sr/)
    assert.match(ics, /UID:evt-1-123@myswimday.com/)
    assert.match(ics, /SUMMARY:Sr Practice/)
    assert.match(ics, /LOCATION:Albany Academy/)
    assert.match(ics, /DTSTART;TZID=America\/New_York:/)
  })
})

describe('feedCalendarName', () => {
  it('joins groups and extras', () => {
    const tenant = { displayName: 'Delmar Dolfins' }
    assert.equal(
      feedCalendarName(tenant, [{ label: 'Sr' }, { label: 'Jr' }], {
        practices: true,
        meets: true,
        events: false,
      }),
      'Delmar Dolfins · Sr, Jr + meets',
    )
  })
})

describe('icsFilename', () => {
  it('uses the tenant prefix', () => {
    assert.equal(
      icsFilename({ icsFilenamePrefix: 'delmar-dolfins' }),
      'delmar-dolfins.ics',
    )
  })
})

describe('getHorizonRange', () => {
  it('covers past days through N weeks ahead', () => {
    const now = new Date('2026-09-16T16:00:00Z')
    const range = getHorizonRange(now, 'America/New_York', 7, 8)
    const days =
      (range.rangeEnd.getTime() - range.rangeStart.getTime()) / 86400000
    assert.ok(days >= 8 * 7, `window too short: ${days}`)
    assert.ok(days <= 8 * 7 + 10, `window too long: ${days}`)
    assert.equal(range.futureWeeks, 8)
    assert.equal(range.pastDays, 7)
  })
})
