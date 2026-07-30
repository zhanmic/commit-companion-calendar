#!/usr/bin/env node
import {
  addLead,
  getSummary,
  runEnrich,
  runExport,
  runFingerprint,
  runProcessOne,
  runProcessPending,
  runScore,
  runSeed,
  runUsaDiscover,
  searchLeads,
} from './jobs.js'
import { getLead, listLeads, updateLead, type LeadStatus } from './db.js'
import { EXPORT_PATH, OLLAMA_MODEL, TOOL_ROOT } from './config.js'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { readFile } from 'node:fs/promises'

const PORT = Number(process.env.PORT ?? '3847')
const PUBLIC_DIR = join(TOOL_ROOT, 'public')

/** Two parallel lanes: discover (USA Swimming) vs process (fingerprint/enrich/…). */
let discoverBusy = false
let processBusy = false
let processAbort: AbortController | null = null

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(data)
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function startSse(res: ServerResponse): (line: string) => void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })
  res.write(': connected\n\n')
  return (line: string) => {
    res.write(`data: ${JSON.stringify({ type: 'log', line })}\n\n`)
  }
}

function laneFor(action: string): 'discover' | 'process' | null {
  if (action === 'usas' || action === 'seed') return 'discover'
  if (action === 'export') return null
  return 'process'
}

async function handleRun(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req)
  let body: {
    action?: string
    target?: string | number
    state?: string
    query?: string
    zip?: string
    limit?: number
    includeContacts?: boolean
    forceRefresh?: boolean
    forceReimport?: boolean
    forceReprocess?: boolean
    fingerprint?: boolean
    enrich?: boolean
    score?: boolean
  }
  try {
    body = JSON.parse(raw || '{}') as typeof body
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON' })
    return
  }

  const action = body.action
  const target = body.target ?? 'all'
  if (
    action !== 'seed' &&
    action !== 'usas' &&
    action !== 'process' &&
    action !== 'fingerprint' &&
    action !== 'enrich' &&
    action !== 'score' &&
    action !== 'export'
  ) {
    sendJson(res, 400, { error: 'Unknown action' })
    return
  }

  const lane = laneFor(action)
  if (lane === 'discover' && discoverBusy) {
    sendJson(res, 409, { error: 'Discover already running' })
    return
  }
  if (lane === 'process' && processBusy) {
    sendJson(res, 409, {
      error: 'Process lane busy (fingerprint/enrich/score)',
    })
    return
  }

  if (lane === 'discover') discoverBusy = true
  else if (lane === 'process') {
    processBusy = true
    processAbort = new AbortController()
  }

  const signal = lane === 'process' ? processAbort!.signal : undefined
  const log = startSse(res)
  const done = (ok: boolean, error?: string) => {
    if (lane === 'discover') discoverBusy = false
    else if (lane === 'process') {
      processBusy = false
      processAbort = null
    }
    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        ok,
        error: error ?? null,
        summary: getSummary(),
        busy: { discover: discoverBusy, process: processBusy },
      })}\n\n`,
    )
    res.end()
  }

  try {
    if (action === 'usas') {
      log('Starting USA Swimming discover…')
      await runUsaDiscover(
        {
          state: body.state,
          query: body.query,
          zip: body.zip,
          limit: body.limit,
          includeContacts: body.includeContacts,
          forceRefresh: body.forceRefresh,
          forceReimport: body.forceReimport,
        },
        log,
      )
    } else if (action === 'process') {
      const oneId = Number(target)
      if (target !== 'all' && Number.isFinite(oneId) && oneId > 0) {
        log(`Starting process one (#${oneId}: fingerprint → enrich → score)…`)
        await runProcessOne(
          oneId,
          {
            forceReprocess: body.forceReprocess,
            signal,
          },
          log,
        )
      } else {
        log('Starting process pending (fingerprint → enrich → score)…')
        await runProcessPending(
          {
            limit: body.limit,
            fingerprint: body.fingerprint,
            enrich: body.enrich,
            score: body.score,
            forceReprocess: body.forceReprocess,
            signal,
          },
          log,
        )
      }
    } else {
      log(
        `Starting ${action}${action === 'seed' || action === 'export' ? '' : ` (${target})`}…`,
      )
      if (action === 'seed') await runSeed(undefined, log)
      else if (action === 'fingerprint')
        await runFingerprint(target, log, signal)
      else if (action === 'enrich') await runEnrich(target, log, signal)
      else if (action === 'score') await runScore(target, log, signal)
      else runExport(undefined, log)
    }
    done(true)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`ERROR: ${message}`)
    done(false, message)
  }
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const { pathname } = url
  const method = req.method ?? 'GET'

  if (method === 'GET' && pathname === '/api/summary') {
    sendJson(res, 200, {
      ...getSummary(),
      model: OLLAMA_MODEL,
      busy: { discover: discoverBusy, process: processBusy },
    })
    return true
  }

  if (method === 'GET' && pathname === '/api/leads') {
    const q = url.searchParams.get('q') ?? ''
    const leads = searchLeads(q)
    sendJson(res, 200, { leads })
    return true
  }

  if (method === 'GET' && pathname.startsWith('/api/leads/')) {
    const id = Number(pathname.slice('/api/leads/'.length))
    const lead = getLead(id)
    if (!lead) {
      sendJson(res, 404, { error: 'Not found' })
      return true
    }
    sendJson(res, 200, { lead })
    return true
  }

  if (method === 'POST' && pathname === '/api/leads') {
    const raw = await readBody(req)
    const body = JSON.parse(raw || '{}') as {
      team_name?: string
      website_url?: string
      super_team_id?: string
      region_notes?: string
    }
    if (!body.website_url && !body.super_team_id) {
      sendJson(res, 400, { error: 'website_url or super_team_id required' })
      return true
    }
    const id = addLead({
      team_name: body.team_name,
      website_url: body.website_url,
      super_team_id: body.super_team_id,
      region_notes: body.region_notes,
    })
    sendJson(res, 200, { id, lead: getLead(id), summary: getSummary() })
    return true
  }

  if (method === 'PATCH' && pathname.startsWith('/api/leads/')) {
    const id = Number(pathname.slice('/api/leads/'.length))
    const lead = getLead(id)
    if (!lead) {
      sendJson(res, 404, { error: 'Not found' })
      return true
    }
    const raw = await readBody(req)
    const body = JSON.parse(raw || '{}') as { status?: LeadStatus }
    if (body.status) updateLead(id, { status: body.status })
    sendJson(res, 200, { lead: getLead(id) })
    return true
  }

  if (method === 'POST' && pathname === '/api/run') {
    await handleRun(req, res)
    return true
  }

  if (method === 'POST' && pathname === '/api/stop') {
    const raw = await readBody(req)
    let body: { lane?: string } = {}
    try {
      body = JSON.parse(raw || '{}') as { lane?: string }
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON' })
      return true
    }
    const lane = body.lane ?? 'process'
    if (lane !== 'process') {
      sendJson(res, 400, { error: 'Only process lane stop is supported' })
      return true
    }
    if (!processBusy || !processAbort) {
      sendJson(res, 200, { ok: true, stopped: false, message: 'Process not running' })
      return true
    }
    processAbort.abort()
    sendJson(res, 200, { ok: true, stopped: true, message: 'Stop requested' })
    return true
  }

  if (method === 'GET' && pathname === '/api/export.csv') {
    runExport()
    if (!existsSync(EXPORT_PATH)) {
      sendJson(res, 404, { error: 'No export yet' })
      return true
    }
    const csv = readFileSync(EXPORT_PATH, 'utf8')
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="leads-export.csv"',
    })
    res.end(csv)
    return true
  }

  return false
}

async function serveStatic(
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  let filePath = pathname === '/' ? '/index.html' : pathname
  filePath = join(PUBLIC_DIR, filePath)
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    res.writeHead(404).end('Not found')
    return
  }
  const ext = extname(filePath)
  const body = await readFile(filePath)
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
  res.end(body)
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url)
      if (!handled) sendJson(res, 404, { error: 'Not found' })
      return
    }
    await serveStatic(res, url.pathname)
  } catch (err) {
    console.error(err)
    if (!res.headersSent) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      })
    } else {
      res.end()
    }
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Commit Leads UI → http://127.0.0.1:${PORT}`)
  console.log(`Model: ${OLLAMA_MODEL}  |  leads: ${listLeads().length}`)
})
