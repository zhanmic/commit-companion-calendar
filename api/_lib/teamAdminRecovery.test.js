import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  buildTeamAdminUnlockUrl,
  getTeamAdminEmail,
  maskEmail,
} from './teamAdminRecovery.js'

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key]
  }
  Object.assign(process.env, ORIGINAL_ENV)
  delete process.env.TEAM_ADMIN_EMAILS
  delete process.env.TEAM_ADMIN_EMAIL_VORTEXSWIMCLUB
  delete process.env.TEAM_ADMIN_TOKENS
  delete process.env.TEAM_ADMIN_TOKEN_VORTEXSWIMCLUB
})

describe('maskEmail', () => {
  it('masks the local part', () => {
    assert.equal(maskEmail('zhanmic@gmail.com'), 'z***@gmail.com')
  })
})

describe('getTeamAdminEmail', () => {
  it('uses Delmar and Vortex code defaults', () => {
    assert.equal(getTeamAdminEmail('DelmarDolfins'), 'zhanmic@gmail.com')
    assert.equal(getTeamAdminEmail('1'), 'zhanmic@gmail.com')
    assert.equal(getTeamAdminEmail('VortexSwimClub'), 'zhanmic@gmail.com')
    assert.equal(getTeamAdminEmail('2'), 'zhanmic@gmail.com')
  })

  it('prefers per-slug env override for coach handoff', () => {
    process.env.TEAM_ADMIN_EMAIL_VORTEXSWIMCLUB = 'coach@example.com'
    assert.equal(getTeamAdminEmail('VortexSwimClub'), 'coach@example.com')
  })

  it('reads TEAM_ADMIN_EMAILS JSON map', () => {
    process.env.TEAM_ADMIN_EMAILS = JSON.stringify({
      VortexSwimClub: 'map@example.com',
    })
    assert.equal(getTeamAdminEmail('vortex'), 'map@example.com')
  })
})

describe('buildTeamAdminUnlockUrl', () => {
  it('embeds the team password as ?ta=', () => {
    process.env.TEAM_ADMIN_TOKEN_VORTEXSWIMCLUB = 'secret-vortex'
    const url = buildTeamAdminUnlockUrl(
      {
        slug: 'VortexSwimClub',
        path: '/2',
        shortSlug: '2',
      },
      'https://myswimday.com',
    )
    assert.equal(url, 'https://myswimday.com/2?ta=secret-vortex')
  })

  it('returns null when password missing', () => {
    const url = buildTeamAdminUnlockUrl(
      { slug: 'VortexSwimClub', path: '/2' },
      'https://myswimday.com',
    )
    assert.equal(url, null)
  })
})
