#!/usr/bin/env node
import {
  addLead,
  getSummary,
  runDraftOne,
  runDraftPending,
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
import { getLead, listLeads, nextContactedStatus, updateLead, type LeadStatus } from './db.js'
import {
  draftOutreachEmail,
  draftOutreachSequence,
  getOutreachDrafts,
  parseDraftHooks,
  type OutreachTouch,
} from './draftEmail.js'
import { saveOutreachDrafts, setTouchDraft } from './outreachDrafts.js'
import { ensureHtmlDraftBody } from './emailHtml.js'
import { openMailDraft } from './openMail.js'
import { OllamaUnavailableError } from './ollama.js'
import {
  EXPORT_PATH,
  HOST,
  JobStoppedError,
  OLLAMA_MODEL,
  PORT,
  TOOL_ROOT,
} from './config.js'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { readFile } from 'node:fs/promises'

/** Prefer private LAN IPv4s (en0/Wi‑Fi first) for phone access URLs. */
function lanIpv4Addresses(): string[] {
  const nets = networkInterfaces()
  const preferred: string[] = []
  const others: string[] = []
  for (const [name, entries] of Object.entries(nets)) {
    if (!entries) continue
    for (const e of entries) {
      if (e.family !== 'IPv4' || e.internal) continue
      if (name.startsWith('en') || name.includes('Wi-Fi') || name.includes('wlan')) {
        preferred.push(e.address)
      } else {
        others.push(e.address)
      }
    }
  }
  return [...new Set([...preferred, ...others])]
}

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
    touches?: Array<1 | 2 | 3>
    statuses?: LeadStatus[]
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
    action !== 'draft' &&
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
      error: 'Process lane busy (fingerprint/enrich/score/draft)',
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
    } else if (action === 'draft') {
      const oneId = Number(target)
      if (target !== 'all' && Number.isFinite(oneId) && oneId > 0) {
        log(`Starting draft one (#${oneId})…`)
        await runDraftOne(
          oneId,
          {
            touches: body.touches,
            force: body.forceReprocess !== false,
            signal,
          },
          log,
        )
      } else {
        log(
          `Starting draft queue (touches [${(body.touches ?? [1, 2, 3]).join(', ')}])…`,
        )
        await runDraftPending(
          {
            limit: body.limit,
            forceReprocess: body.forceReprocess,
            touches: body.touches,
            statuses: body.statuses,
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

  const leadMatch = pathname.match(/^\/api\/leads\/(\d+)(?:\/([a-z-]+))?$/)

  if (method === 'GET' && leadMatch && !leadMatch[2]) {
    const id = Number(leadMatch[1])
    const lead = getLead(id)
    if (!lead) {
      sendJson(res, 404, { error: 'Not found' })
      return true
    }
    const drafts = getOutreachDrafts(lead)
    sendJson(res, 200, {
      lead,
      drafts,
      hooks: parseDraftHooks(lead.draft_hooks),
    })
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

  if (method === 'POST' && leadMatch?.[2] === 'draft') {
    const id = Number(leadMatch[1])
    const lead = getLead(id)
    if (!lead) {
      sendJson(res, 404, { error: 'Not found' })
      return true
    }
    if (processBusy) {
      sendJson(res, 409, {
        error: 'Process lane busy — stop the current job or wait',
      })
      return true
    }
    const raw = await readBody(req)
    let body: { touch?: number; all?: boolean; force?: boolean } = {}
    try {
      body = JSON.parse(raw || '{}') as typeof body
    } catch {
      body = {}
    }

    processBusy = true
    processAbort = new AbortController()
    const signal = processAbort.signal

    try {
      // Explicit all:true, or no touch field → full 1→2→3 sequence.
      // touch:1|2|3 alone regenerates that one email.
      const wantAll = body.all === true || body.touch == null
      if (wantAll) {
        const seq = await draftOutreachSequence(lead, {
          touches: [1, 2, 3],
          force: body.force !== false,
          signal,
        })
        const t1 = seq.drafts['1']
        const ready = (['1', '2', '3'] as const).filter((k) =>
          Boolean(seq.drafts[k]?.body?.trim()),
        )
        sendJson(res, 200, {
          ok: seq.failed.length === 0 && ready.length === 3,
          sequence: seq,
          readyTouches: ready.map(Number),
          draft: t1
            ? {
                subject: t1.subject,
                body: t1.body,
                customization_hooks: t1.hooks,
                touch: 1 as OutreachTouch,
                drafts: seq.drafts,
                schedule: seq.schedule,
                scheduleError: seq.scheduleError,
              }
            : null,
          lead: getLead(id),
          busy: { discover: discoverBusy, process: false },
        })
      } else {
        const touch = Number(body.touch) as OutreachTouch
        if (![1, 2, 3].includes(touch)) {
          sendJson(res, 400, { error: 'touch must be 1, 2, or 3' })
          return true
        }
        const draft = await draftOutreachEmail(lead, touch, signal)
        sendJson(res, 200, {
          ok: true,
          draft,
          lead: getLead(id),
          busy: { discover: discoverBusy, process: false },
        })
      }
    } catch (err) {
      if (err instanceof JobStoppedError) {
        sendJson(res, 200, {
          ok: false,
          stopped: true,
          error: err.message,
          lead: getLead(id),
          drafts: getOutreachDrafts(getLead(id)!),
          busy: { discover: discoverBusy, process: false },
        })
      } else {
        const message = err instanceof Error ? err.message : String(err)
        const status = err instanceof OllamaUnavailableError ? 503 : 500
        sendJson(res, status, { error: message })
      }
    } finally {
      processBusy = false
      processAbort = null
    }
    return true
  }

  if (method === 'POST' && leadMatch?.[2] === 'draft-save') {
    const id = Number(leadMatch[1])
    const lead = getLead(id)
    if (!lead) {
      sendJson(res, 404, { error: 'Not found' })
      return true
    }
    const raw = await readBody(req)
    let body: { touch?: number; subject?: string; body?: string } = {}
    try {
      body = JSON.parse(raw || '{}') as typeof body
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON' })
      return true
    }
    const touch = ([1, 2, 3] as const).includes(body.touch as 1 | 2 | 3)
      ? (body.touch as OutreachTouch)
      : 1
    const existing = getOutreachDrafts(lead)
    const prev = existing[String(touch) as '1' | '2' | '3']
    const next = setTouchDraft(existing, touch, {
      subject: (body.subject ?? prev?.subject ?? '').trim(),
      body: ensureHtmlDraftBody((body.body ?? prev?.body ?? '').trim()),
      hooks: prev?.hooks ?? [],
    })
    saveOutreachDrafts(id, next, {
      markDrafted: true,
      currentStatus: lead.status,
    })
    sendJson(res, 200, {
      ok: true,
      drafts: getOutreachDrafts(getLead(id)!),
      lead: getLead(id),
    })
    return true
  }

  if (method === 'POST' && leadMatch?.[2] === 'open-mail') {
    const id = Number(leadMatch[1])
    const lead = getLead(id)
    if (!lead) {
      sendJson(res, 404, { error: 'Not found' })
      return true
    }
    const raw = await readBody(req)
    let body: {
      subject?: string
      body?: string
      touch?: number
      markContacted?: boolean
      save?: boolean
    } = {}
    try {
      body = JSON.parse(raw || '{}') as typeof body
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON' })
      return true
    }

    const touch = ([1, 2, 3] as const).includes(body.touch as 1 | 2 | 3)
      ? (body.touch as OutreachTouch)
      : 1
    const existing = getOutreachDrafts(lead)
    const fromTouch = existing[String(touch) as '1' | '2' | '3']
    const subject = (
      body.subject ??
      fromTouch?.subject ??
      lead.draft_subject ??
      ''
    ).trim()
    const emailBody = ensureHtmlDraftBody(
      (body.body ?? fromTouch?.body ?? lead.draft_email ?? '').trim(),
    )
    if (!emailBody) {
      sendJson(res, 400, {
        error: 'No draft body — generate a draft first',
      })
      return true
    }

    if (body.save !== false) {
      const next = setTouchDraft(existing, touch, {
        subject,
        body: emailBody,
        hooks: fromTouch?.hooks ?? [],
      })
      saveOutreachDrafts(id, next, {
        markDrafted: true,
        currentStatus: lead.status,
      })
    }

    const mail = await openMailDraft({
      to: lead.contact_email,
      subject: subject || `Quick idea for ${lead.team_name || 'your team'}`,
      body: emailBody,
    })

    let markedContacted = false
    if (body.markContacted && mail.ok) {
      updateLead(id, { status: nextContactedStatus(lead.status, touch) })
      markedContacted = true
    }

    sendJson(res, 200, {
      ok: mail.ok,
      mail,
      markedContacted,
      touch,
      lead: getLead(id),
    })
    return true
  }

  if (method === 'PATCH' && leadMatch && !leadMatch[2]) {
    const id = Number(leadMatch[1])
    const lead = getLead(id)
    if (!lead) {
      sendJson(res, 404, { error: 'Not found' })
      return true
    }
    const raw = await readBody(req)
    const body = JSON.parse(raw || '{}') as {
      status?: LeadStatus | 'contacted'
      bumpContacted?: boolean
      touch?: number
      draft_email?: string
      draft_subject?: string
    }
    const patch: Partial<{
      status: LeadStatus
      draft_email: string | null
      draft_subject: string | null
    }> = {}
    if (body.bumpContacted) {
      const touch = ([1, 2, 3] as const).includes(body.touch as 1 | 2 | 3)
        ? (body.touch as 1 | 2 | 3)
        : undefined
      patch.status = nextContactedStatus(lead.status, touch)
    } else if (body.status === 'contacted') {
      patch.status = 'contacted_1'
    } else if (body.status) {
      patch.status = body.status
    }
    if (typeof body.draft_email === 'string') {
      patch.draft_email = body.draft_email
    }
    if (typeof body.draft_subject === 'string') {
      patch.draft_subject = body.draft_subject
    }
    if (Object.keys(patch).length) updateLead(id, patch)
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
    sendJson(res, 200, {
      ok: true,
      stopped: true,
      message: 'Stop requested — finishes after the current Ollama call if one is in flight',
    })
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

server.listen(PORT, HOST, () => {
  console.log(`Commit Leads UI → http://127.0.0.1:${PORT}`)
  if (HOST === '0.0.0.0' || HOST === '::') {
    const ips = lanIpv4Addresses()
    if (ips.length === 0) {
      console.log(
        `LAN (phone)   → (no LAN IPv4 found — run: ipconfig getifaddr en0)`,
      )
    } else {
      for (const ip of ips) {
        console.log(`LAN (phone)   → http://${ip}:${PORT}  (same Wi‑Fi)`)
      }
    }
  } else {
    console.log(`Bound          → http://${HOST}:${PORT}`)
  }
  console.log(`Model: ${OLLAMA_MODEL}  |  leads: ${listLeads().length}`)
})
