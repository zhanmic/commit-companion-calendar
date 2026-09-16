import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import handler from './schedule.js'

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

describe('GET /api/schedule', () => {
  it('returns usage when called with no query', async () => {
    const { res, json } = await call('/api/schedule')
    assert.equal(res.statusCode, 200)
    assert.equal(json.product, 'My Swim Day')
    assert.ok(json.examples[0].includes('group=Sr'))
    assert.ok(json.tenants.some((t) => t.slug === 'DelmarDolfins'))
    assert.equal(res.headers['Access-Control-Allow-Origin'], '*')
  })

  it('rejects an unknown team', async () => {
    const { res, json } = await call('/api/schedule?team=NoSuchTeam&group=Sr')
    assert.equal(res.statusCode, 404)
    assert.match(json.error, /Unknown team/)
  })

  it('accepts the short public team URL as team=1', async () => {
    const { res, json } = await call('/api/schedule?team=1')
    assert.equal(res.statusCode, 400)
    assert.match(json.error, /Missing group/)
  })

  it('rejects a missing group', async () => {
    const { res, json } = await call('/api/schedule?team=DelmarDolfins')
    assert.equal(res.statusCode, 400)
    assert.match(json.error, /Missing group/)
    assert.ok(json.groups.some((g) => g.id === 'Sr'))
  })

  it('rejects an unknown group before hitting Commit', async () => {
    const { res, json } = await call(
      '/api/schedule?team=DelmarDolfins&group=Masters',
    )
    assert.equal(res.statusCode, 400)
    assert.match(json.error, /Unknown group/)
  })

  it('rejects a bad date before hitting Commit', async () => {
    const { res, json } = await call(
      '/api/schedule?team=DelmarDolfins&group=Sr&date=next-week',
    )
    assert.equal(res.statusCode, 400)
    assert.match(json.error, /Invalid date/)
  })

  it('rejects this weekend without a weekday', async () => {
    const { res, json } = await call(
      '/api/schedule?team=DelmarDolfins&group=Sr&date=this%20weekend',
    )
    assert.equal(res.statusCode, 400)
    assert.match(json.error, /this Friday/)
  })
})
