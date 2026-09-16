import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import handler from './calendar.js'

function mockReq(url, method = 'GET') {
  return {
    method,
    url,
    headers: { host: 'localhost:3000', 'x-forwarded-proto': 'http' },
    query: {},
  }
}

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name] = value
    },
    end(body) {
      this.body = body ?? ''
    },
  }
}

async function call(url, method) {
  const req = mockReq(url, method)
  const res = mockRes()
  await handler(req, res)
  let json = null
  try {
    json = JSON.parse(res.body)
  } catch {
    json = null
  }
  return { res, json }
}

describe('GET /api/calendar', () => {
  it('returns usage when called with no query', async () => {
    const { res, json } = await call('/api/calendar')
    assert.equal(res.statusCode, 200)
    assert.equal(json.product, 'My Swim Day')
    assert.ok(json.subscribe.webcal.includes('webcal://'))
    assert.ok(json.examples[0].includes('group='))
  })

  it('serves a one-off encoded ICS without hitting Commit', async () => {
    const ics =
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:x@myswimday.com\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
    const d = Buffer.from(ics, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
    const { res } = await call(`/api/calendar?d=${d}`)
    assert.equal(res.statusCode, 200)
    assert.match(res.headers['Content-Type'], /text\/calendar/)
    assert.match(res.body, /BEGIN:VCALENDAR/)
    assert.match(res.body, /UID:x@myswimday.com/)
  })

  it('rejects an unknown team', async () => {
    const { res, json } = await call('/api/calendar?team=NoSuchTeam&group=Sr')
    assert.equal(res.statusCode, 404)
    assert.match(json.error, /Unknown team/)
  })

  it('rejects a missing group for the default practice feed', async () => {
    const { res, json } = await call('/api/calendar?team=1')
    assert.equal(res.statusCode, 400)
    assert.match(json.error, /Missing group/)
  })

  it('allows a meets-only feed without a group', async () => {
    const { res, json } = await call('/api/calendar?team=1&include=meets')
    assert.notEqual(res.statusCode, 400, res.body)
    assert.doesNotMatch(json?.error ?? '', /Missing group/)
    if (res.statusCode === 200) {
      assert.match(res.body, /BEGIN:VCALENDAR/)
      assert.match(res.headers['Content-Type'], /text\/calendar/)
    }
  })
})
