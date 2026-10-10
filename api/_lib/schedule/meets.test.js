import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { expandMeets } from './expand.js'
import { formatDateSpan, getDayRange, getWeekRange } from './week.js'

const TZ = 'America/New_York'

function parseMeet(meet) {
  return {
    name: meet.titleEventsFile,
    location: meet.locationDetails ?? null,
    start: new Date(meet.startDateTime),
    end: new Date(meet.endDateTime),
  }
}

/** Donner October Invitational as stored by Commit: Fri noon through Sun noon. */
const OCTOBER_INVITE = {
  _id: 'fzre2w9fb8BDqHGCq',
  titleEventsFile: 'Donner October Invitational',
  startDateTime: '2026-10-23T16:00:00.000Z',
  endDateTime: '2026-10-25T16:00:00.000Z',
  locationDetails: 'Chick Newell Natatorium',
}

const MOCK_MEET = {
  _id: 'mock',
  titleEventsFile: 'Donner Mock Meet',
  startDateTime: '2026-10-08T16:00:00.000Z',
  endDateTime: '2026-10-08T16:00:00.000Z',
}

describe('multi-day meets', () => {
  it('labels the October invitational as Oct 23–25, not a same-clock range', () => {
    const start = new Date(OCTOBER_INVITE.startDateTime)
    const end = new Date(OCTOBER_INVITE.endDateTime)
    assert.equal(formatDateSpan(start, end, TZ), 'Oct 23–25')
  })

  it('keeps a same-instant meet on one day', () => {
    const start = new Date(MOCK_MEET.startDateTime)
    const end = new Date(MOCK_MEET.endDateTime)
    assert.equal(formatDateSpan(start, end, TZ), null)
  })

  it('stays visible on later days of the span, including the next week', () => {
    const fridayWeek = getWeekRange(new Date('2026-10-23T16:00:00.000Z'), TZ)
    const sundayWeek = getWeekRange(new Date('2026-10-25T16:00:00.000Z'), TZ)
    const saturday = getDayRange(new Date('2026-10-24T16:00:00.000Z'), TZ)
    const monday = getDayRange(new Date('2026-10-26T16:00:00.000Z'), TZ)

    assert.equal(expandMeets([OCTOBER_INVITE], fridayWeek.rangeStart, fridayWeek.rangeEnd, parseMeet).length, 1)
    assert.equal(expandMeets([OCTOBER_INVITE], sundayWeek.rangeStart, sundayWeek.rangeEnd, parseMeet).length, 1)
    assert.equal(expandMeets([OCTOBER_INVITE], saturday.rangeStart, saturday.rangeEnd, parseMeet).length, 1)
    assert.equal(expandMeets([OCTOBER_INVITE], monday.rangeStart, monday.rangeEnd, parseMeet).length, 0)
  })

  it('does not pull a point meet into a later week', () => {
    const later = getWeekRange(new Date('2026-10-18T16:00:00.000Z'), TZ)
    assert.equal(expandMeets([MOCK_MEET], later.rangeStart, later.rangeEnd, parseMeet).length, 0)
  })
})
