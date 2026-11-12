import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isWithinSendWindow } from '../cron/send-digests.js'

describe('isWithinSendWindow', () => {
  it('includes the send hour and one catch-up hour', () => {
    assert.equal(isWithinSendWindow(7, 7), true)
    assert.equal(isWithinSendWindow(8, 7), true)
    assert.equal(isWithinSendWindow(18, 18), true)
    assert.equal(isWithinSendWindow(19, 18), true)
  })

  it('excludes hours before the send hour and after the catch-up window', () => {
    assert.equal(isWithinSendWindow(6, 7), false)
    assert.equal(isWithinSendWindow(9, 7), false)
    assert.equal(isWithinSendWindow(10, 7), false)
    assert.equal(isWithinSendWindow(17, 18), false)
    assert.equal(isWithinSendWindow(20, 18), false)
  })

  it('rejects non-numeric clocks', () => {
    assert.equal(isWithinSendWindow(undefined, 7), false)
    assert.equal(isWithinSendWindow(7, undefined), false)
    assert.equal(isWithinSendWindow('x', 7), false)
  })
})
