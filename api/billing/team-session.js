/**
 * POST /api/billing/team-session
 *
 * Verify a team-admin unlock token for a tenant (from ?ta= on the client).
 * Body: { tenantSlug, token }
 * Returns { ok: true } or 401.
 *
 * Tokens are stored only in api/_lib/tenants.js (not in the frontend bundle).
 */
import { readJsonBody, sendJson } from '../_lib/http.js'
import { getTenantBySlug } from '../_lib/tenants.js'
import { verifyTeamAdminToken } from '../_lib/stripe.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'POST, OPTIONS')
    res.end('Method Not Allowed')
    return
  }

  const body = readJsonBody(req)
  const tenantSlug =
    typeof body?.tenantSlug === 'string' ? body.tenantSlug.trim() : ''
  const token = typeof body?.token === 'string' ? body.token.trim() : ''

  if (!tenantSlug || !token) {
    sendJson(res, 400, { error: 'tenantSlug and token are required' })
    return
  }

  const tenant = getTenantBySlug(tenantSlug)
  if (!tenant) {
    sendJson(res, 400, { error: 'Unknown team' })
    return
  }

  if (!tenant.teamAdminToken) {
    sendJson(res, 403, {
      error: 'Team admin access is not configured for this team yet.',
    })
    return
  }

  if (!verifyTeamAdminToken(tenantSlug, token)) {
    sendJson(res, 401, { error: 'Invalid team admin link.' })
    return
  }

  sendJson(res, 200, {
    ok: true,
    tenantSlug: tenant.slug,
    displayName: tenant.displayName,
  })
}
