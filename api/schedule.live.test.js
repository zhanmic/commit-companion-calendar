import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import handler from './schedule.js'
import { evaluateCounters, ipHourlyLimit, teamHourlyLimit } from './_lib/schedule/rateLimit.js'
import { getTenantBySlug } from './_lib/tenants.js'

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
  let json = null
  try {
    json = JSON.parse(res.body)
  } catch {
    json = null
  }
  return { res, json }
}

describe('live GET /api/schedule', () => {
  it('returns Delmar senior practice time and location for today', async () => {
    const { res, json } = await call(
      '/api/schedule?team=DelmarDolfins&group=senior&date=today',
    )
    assert.equal(res.statusCode, 200, res.body)
    assert.equal(json.ok, true)
    assert.equal(json.teamSlug, 'DelmarDolfins')
    assert.equal(json.group, 'Sr')
    assert.equal(json.timeZone, 'America/New_York')
    assert.ok(typeof json.spoken === 'string' && json.spoken.length > 0)
    assert.ok(Array.isArray(json.sessions))
    if (!json.empty) {
      const session = json.sessions[0]
      assert.ok(session.startTime)
      assert.ok(session.endTime)
      assert.ok('location' in session)
    }
  })

  it('returns spoken text for Siri Shortcuts', async () => {
    const { res } = await call(
      '/api/schedule?team=DelmarDolfins&group=Sr&date=tomorrow&format=spoken',
    )
    assert.equal(res.statusCode, 200, res.body)
    assert.match(res.headers['Content-Type'], /text\/plain/)
    assert.match(res.body, /practice for Delmar Dolfins tomorrow/)
  })

  it('resolves an explicit calendar date', async () => {
    const { res, json } = await call(
      '/api/schedule?team=DelmarDolfins&group=Sr&date=2026-09-16',
    )
    assert.equal(res.statusCode, 200, res.body)
    assert.equal(json.date, '2026-09-16')
    assert.match(json.spoken, /on Wednesday, Sep 16/)
  })
})

describe('attack circuit', () => {
  it('pauses the whole team when volume far exceeds household budget', () => {
    const tenant = getTenantBySlug('DelmarDolfins')
    const teamLimit = teamHourlyLimit(tenant)
    const ipLimit = ipHourlyLimit(tenant)
    const attack = evaluateCounters({
      teamCount: teamLimit * 3,
      ipCount: 5,
      teamLimit,
      ipLimit,
    })
    assert.equal(attack.allowed, false)
    assert.equal(attack.code, 'team_circuit')
  })
})
