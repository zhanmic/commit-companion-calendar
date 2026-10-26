import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { digestSentKey, subscribersPendingSend } from './sendDigest.js'

describe('digest already sent', () => {
  it('uses the local calendar day and the Sunday that starts the week', () => {
    const morning = new Date('2026-10-25T11:30:00.000Z')
    assert.equal(digestSentKey('daily', morning, 'America/New_York'), '2026-10-25')
    assert.equal(digestSentKey('weekly', morning, 'America/New_York'), '2026-10-25')
  })

  it('treats a matching sent marker as nothing left to send', () => {
    const subs = [
      { email: 'a@example.com', lastDailySentOn: '2026-10-25' },
      { email: 'b@example.com', lastDailySentOn: '2026-10-25' },
    ]
    assert.deepEqual(subscribersPendingSend(subs, 'daily', '2026-10-25'), [])
  })

  it('keeps subscribers who have not been sent this range', () => {
    const subs = [
      { email: 'a@example.com', lastWeeklySentOn: '2026-10-18' },
      { email: 'b@example.com', lastWeeklySentOn: '2026-10-25' },
    ]
    const pending = subscribersPendingSend(subs, 'weekly', '2026-10-25')
    assert.deepEqual(pending.map((sub) => sub.email), ['a@example.com'])
  })
})
