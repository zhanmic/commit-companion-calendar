import { listTenants } from './_lib/tenants.js'

/**
 * GET /api/tenants — public multi-tenant catalog.
 * Frontend registry is the source of schedule/parser config;
 * this endpoint exposes discoverable tenant paths for clients.
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET')
    res.end('Method Not Allowed')
    return
  }

  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=60')
  res.end(
    JSON.stringify({
      product: 'CommitCompanionCalendar',
      tenants: listTenants(),
    }),
  )
}
