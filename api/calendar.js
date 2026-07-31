/**
 * Serve an .ics calendar inline so iPhone Safari opens Quick Look with
 * the native “Add To Calendar” button.
 *
 * Query: ?d=<base64url of utf-8 ics>
 * Product: CommitCompanionCalendar (tenant-agnostic payload transport)
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET')
    res.end('Method Not Allowed')
    return
  }

  const raw = typeof req.query?.d === 'string' ? req.query.d : ''
  if (!raw) {
    res.statusCode = 400
    res.end('Missing calendar payload')
    return
  }

  let ics = ''
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    ics = Buffer.from(padded, 'base64').toString('utf8')
  } catch {
    res.statusCode = 400
    res.end('Invalid calendar payload')
    return
  }

  if (!ics.includes('BEGIN:VCALENDAR')) {
    res.statusCode = 400
    res.end('Invalid calendar content')
    return
  }

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader(
    'Content-Disposition',
    'inline; filename="myswimday.ics"',
  )
  res.setHeader('Cache-Control', 'no-store')
  res.end(ics)
}
