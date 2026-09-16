import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import handler from '../calendar.js'

function mockReq(url) {
  return {
    method: 'GET',
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

async function call(url) {
  const req = mockReq(url)
  const res = mockRes()
  await handler(req, res)
  return res
}

describe('live GET /api/calendar feed', () => {
  it('returns an ICS subscription for Delmar Sr', async () => {
    const res = await call('/api/calendar?team=1&group=Sr')
    assert.equal(res.statusCode, 200, res.body)
    assert.match(res.headers['Content-Type'], /text\/calendar/)
    assert.match(res.body, /BEGIN:VCALENDAR/)
    assert.match(res.body, /X-WR-CALNAME:Delmar Dolfins/)
    assert.match(res.body, /REFRESH-INTERVAL/)
    assert.match(res.headers['Content-Disposition'], /delmar-dolfins\.ics/)
  })

  it('returns a valid empty-capable meets feed', async () => {
    const res = await call('/api/calendar?team=1&include=meets,events')
    assert.equal(res.statusCode, 200, res.body)
    assert.match(res.body, /BEGIN:VCALENDAR/)
    assert.match(res.body, /END:VCALENDAR/)
  })
})
