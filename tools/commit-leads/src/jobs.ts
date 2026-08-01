import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import {
  RATE_LIMIT_MS,
  SEEDS_EXAMPLE_PATH,
  SEEDS_PATH,
  ensureDataDir,
  sleep,
  JobStoppedError,
} from './config.js'
import {
  getLead,
  findLeadByWebsite,
  findLeadBySuperTeamId,
  listLeads,
  statusCounts,
  updateLead,
  upsertSeed,
  repairScannedStatuses,
  type Lead,
  type SeedRow,
} from './db.js'
import {
  enrichFromCommitApi,
  enrichFromSiteContactPages,
} from './enrich.js'
import { exportCsv } from './export.js'
import { fingerprintSite } from './fingerprintSite.js'
import { draftOutreachSequence } from './draftEmail.js'
import {
  allTouchesReady,
  getOutreachDrafts,
  missingTouches,
} from './outreachDrafts.js'
import { scoreLead } from './score.js'
import {
  searchUsaClubs,
  usaRegionNotes,
  type UsaSearchFilters,
} from './usaSwimming.js'

export type LogFn = (line: string) => void

export { JobStoppedError }

function throwIfStopped(signal?: AbortSignal): void {
  if (signal?.aborted) throw new JobStoppedError()
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  if (lines.length === 0) return []
  const headers = splitCsvLine(lines[0]).map((h) => h.trim())
  const rows: Record<string, string>[] = []
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? '').trim()
    })
    rows.push(row)
  }
  return rows
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

export function resolveLeads(arg: string | number | undefined): Lead[] {
  if (arg === undefined || arg === '' || arg === 'all') return listLeads()
  const id = typeof arg === 'number' ? arg : Number(arg)
  if (!Number.isFinite(id)) {
    throw new Error(`Expected lead id or "all", got: ${arg}`)
  }
  const lead = getLead(id)
  if (!lead) throw new Error(`Lead ${id} not found`)
  return [lead]
}

export async function runSeed(
  pathArg: string | undefined,
  log: LogFn = console.log,
): Promise<{ created: number; updated: number }> {
  ensureDataDir()
  const path = pathArg ?? SEEDS_PATH
  if (!existsSync(path)) {
    if (!pathArg && existsSync(SEEDS_EXAMPLE_PATH)) {
      copyFileSync(SEEDS_EXAMPLE_PATH, SEEDS_PATH)
      log(`Created ${SEEDS_PATH} from seeds.example.csv`)
    } else {
      throw new Error(`Seeds file not found: ${path}`)
    }
  }
  const data = parseCsv(readFileSync(path, 'utf8'))
  let created = 0
  let updated = 0
  for (const row of data) {
    const result = upsertSeed({
      team_name: row.team_name || row.name,
      website_url: row.website_url || row.website || row.url,
      super_team_id: row.super_team_id || row.superTeamId,
      region_notes: row.region_notes || row.notes,
    })
    if (result.created) created++
    else updated++
    log(
      `${result.created ? 'created' : 'updated'} #${result.id} ${row.team_name || row.website_url}`,
    )
  }
  log(`Seed complete: ${created} created, ${updated} updated`)
  return { created, updated }
}

export function addLead(row: SeedRow, log: LogFn = console.log): number {
  const result = upsertSeed(row)
  log(
    `${result.created ? 'created' : 'updated'} #${result.id} ${row.team_name || row.website_url}`,
  )
  return result.id
}

export async function runUsaDiscover(
  filters: UsaSearchFilters & {
    includeContacts?: boolean
    forceRefresh?: boolean
    /** Re-upsert clubs already in DB (default: skip existing websites). */
    forceReimport?: boolean
  },
  log: LogFn = console.log,
): Promise<{
  created: number
  updated: number
  skipped: number
  matched: number
}> {
  const includeContacts = filters.includeContacts !== false
  const skipExisting = filters.forceReimport !== true
  const state = filters.state?.trim().toUpperCase() || undefined
  // Full national import by default (~2400 with websites)
  const limit = filters.limit ?? 5000

  log(
    `USA Swimming import: ${state || filters.query || filters.zip ? `filter state=${state || '(any)'} query=${filters.query || '(any)'} zip=${filters.zip || '(any)'}` : 'FULL directory'} limit=${limit} skipExisting=${skipExisting}`,
  )
  log(
    'Downloads the full Find a Team directory once (cached ~24h, ~4MB), then imports clubs with websites. Already-imported websites are skipped unless force re-import.',
  )

  const { clubs, totalFacilities, totalClubs } = await searchUsaClubs(
    { ...filters, state, limit, requireWebsite: true },
    { forceRefresh: filters.forceRefresh },
  )
  log(
    `Directory: ${totalFacilities} facilities → ${totalClubs} unique clubs; importing ${clubs.length} with websites`,
  )

  let created = 0
  let updated = 0
  let skipped = 0
  for (const club of clubs) {
    if (!club.websiteUrl) {
      skipped++
      continue
    }
    if (skipExisting && findLeadByWebsite(club.websiteUrl)) {
      skipped++
      continue
    }
    const result = upsertSeed({
      team_name: club.clubName,
      website_url: club.websiteUrl,
      region_notes: usaRegionNotes(club),
      contact_email: includeContacts
        ? club.contactEmail ?? undefined
        : undefined,
      contact_phone: includeContacts
        ? club.contactPhone ?? undefined
        : undefined,
      contact_address: club.address ?? undefined,
      contact_source:
        includeContacts && club.contactEmail ? 'usa_swimming' : undefined,
    })
    if (result.created) created++
    else updated++
    if ((created + updated) % 100 === 0) {
      log(`  … ${created} created, ${updated} updated, ${skipped} skipped`)
    }
  }

  log(
    `USA Swimming import complete: ${created} created, ${updated} updated, ${skipped} skipped (already had / no site)`,
  )
  return { created, updated, skipped, matched: clubs.length }
}

/**
 * Process already-imported leads that still need work.
 * Skips leads already fingerprinted / enriched unless forceReprocess.
 */
export async function runProcessPending(
  options: {
    limit?: number
    fingerprint?: boolean
    enrich?: boolean
    score?: boolean
    forceReprocess?: boolean
    signal?: AbortSignal
  } = {},
  log: LogFn = console.log,
): Promise<void> {
  const doFp = options.fingerprint !== false
  const doEnrich = options.enrich !== false
  const doScore = options.score !== false
  const force = options.forceReprocess === true
  const limit = Math.max(1, Math.min(options.limit ?? 25, 1000))
  const signal = options.signal

  const leads = listLeads()
  const needFp = leads.filter((l) => needsFingerprint(l, force))
  const needEnrich = leads.filter((l) => needsEnrich(l, force))
  const needScore = leads.filter((l) => needsScore(l, force))

  log(
    `Process pending: ${needFp.length} need fingerprint, ${needEnrich.length} need enrich, ${needScore.length} need score. Batch limit=${limit} force=${force}`,
  )

  try {
    if (doFp) {
      const batch = needFp.slice(0, limit)
      if (batch.length === 0) log('Fingerprint: nothing pending (already processed)')
      else {
        log(`Fingerprint batch: ${batch.length}`)
        for (let i = 0; i < batch.length; i++) {
          throwIfStopped(signal)
          const lead = batch[i]
          log(
            `#${lead.id}: fingerprint ${lead.team_name ?? lead.website_url} (${i + 1}/${batch.length})`,
          )
          try {
            await applyFingerprint(lead, log)
            const after = getLead(lead.id)!
            log(`  status → ${after.status}`)
          } catch (err) {
            if (err instanceof JobStoppedError) throw err
            log(`  error: ${err instanceof Error ? err.message : String(err)}`)
            // Mark attempted so we don't retry forever on hard failures
            updateLead(lead.id, {
              confidence: lead.confidence ?? 0,
              evidence: `fingerprinted:error:${err instanceof Error ? err.message : String(err)}`.slice(
                0,
                240,
              ),
              ...(lead.status === 'new' ? { status: 'disqualified' as const } : {}),
            })
            log(`  status → ${getLead(lead.id)!.status}`)
          }
          if (i < batch.length - 1) await sleep(RATE_LIMIT_MS, signal)
        }
      }
    }

    if (doEnrich) {
      throwIfStopped(signal)
      const enrichBatch = listLeads()
        .filter((l) => needsEnrich(l, force))
        .slice(0, limit)

      if (enrichBatch.length === 0) log('Enrich: nothing pending (already processed)')
      else {
        log(`Enrich batch: ${enrichBatch.length}`)
        for (let i = 0; i < enrichBatch.length; i++) {
          throwIfStopped(signal)
          let lead = enrichBatch[i]
          log(
            `#${lead.id}: enrich ${lead.team_name ?? lead.super_team_id} (${i + 1}/${enrichBatch.length})`,
          )
          try {
            await enrichFromCommitApi(lead)
            lead = getLead(lead.id)!
            log(
              `  2a: name=${lead.team_name} email=${lead.contact_email ?? '(none)'}`,
            )
            if (!lead.contact_email && lead.website_url) {
              await sleep(RATE_LIMIT_MS, signal)
              await enrichFromSiteContactPages(lead)
              lead = getLead(lead.id)!
              log(
                `  site: email=${lead.contact_email ?? '(none)'} source=${lead.contact_source ?? '(none)'}`,
              )
            }
            // Enrich done → researched
            const after = getLead(lead.id)!
            if (
              after.super_team_id &&
              (after.status === 'new' ||
                after.status === 'identified' ||
                after.status === 'researched')
            ) {
              updateLead(after.id, { status: 'researched' })
            }
            log(`  status → ${getLead(lead.id)!.status}`)
          } catch (err) {
            if (err instanceof JobStoppedError) throw err
            log(`  error: ${err instanceof Error ? err.message : String(err)}`)
          }
          if (i < enrichBatch.length - 1) await sleep(RATE_LIMIT_MS, signal)
        }
      }
    }

    if (doScore) {
      throwIfStopped(signal)
      const scoreBatch = listLeads()
        .filter((l) => needsScore(l, force))
        .slice(0, limit)

      if (scoreBatch.length === 0) log('Score: nothing pending (already processed)')
      else {
        log(`Score batch: ${scoreBatch.length}`)
        for (let i = 0; i < scoreBatch.length; i++) {
          throwIfStopped(signal)
          const lead = scoreBatch[i]
          log(
            `#${lead.id}: score ${lead.team_name ?? lead.website_url} (${i + 1}/${scoreBatch.length})`,
          )
          try {
            const result = await scoreLead(lead)
            if (result) {
              log(`  fit=${result.fit_score} buyer=${result.buyer_guess}`)
              log(`  status → ${getLead(lead.id)!.status}`)
            } else {
              log('  skipped (Ollama unavailable or empty response)')
            }
          } catch (err) {
            if (err instanceof JobStoppedError) throw err
            log(`  error: ${err instanceof Error ? err.message : String(err)}`)
          }
          if (i < scoreBatch.length - 1) await sleep(RATE_LIMIT_MS, signal)
        }
      }
    }

    log('Process pending complete')
  } catch (err) {
    if (err instanceof JobStoppedError) {
      log('Stopped — finished leads keep their updated status; remaining stay pending')
      return
    }
    throw err
  }
}

/** Full pipeline for a single lead (batch size does not apply). */
export async function runProcessOne(
  id: number,
  options: {
    forceReprocess?: boolean
    signal?: AbortSignal
  } = {},
  log: LogFn = console.log,
): Promise<void> {
  const force = options.forceReprocess === true
  const signal = options.signal
  const lead = getLead(id)
  if (!lead) {
    log(`Lead #${id} not found`)
    return
  }

  log(
    `Process one: #${id} ${lead.team_name ?? lead.website_url ?? ''} force=${force}`,
  )

  try {
    throwIfStopped(signal)
    if (lead.website_url && (force || needsFingerprint(lead, false))) {
      log(`#${id}: fingerprint`)
      try {
        await applyFingerprint(getLead(id)!, log)
        log(`  status → ${getLead(id)!.status}`)
      } catch (err) {
        if (err instanceof JobStoppedError) throw err
        log(`  error: ${err instanceof Error ? err.message : String(err)}`)
        updateLead(id, {
          confidence: getLead(id)!.confidence ?? 0,
          evidence: `fingerprinted:error:${err instanceof Error ? err.message : String(err)}`.slice(
            0,
            240,
          ),
          ...(getLead(id)!.status === 'new'
            ? { status: 'disqualified' as const }
            : {}),
        })
      }
    } else if (!lead.website_url) {
      log(`#${id}: skip fingerprint (no website)`)
    } else {
      log(`#${id}: skip fingerprint (already done)`)
      const cur = getLead(id)!
      if (
        cur.status === 'new' &&
        cur.confidence != null &&
        !cur.super_team_id
      ) {
        updateLead(id, { status: 'disqualified' })
        log('  status → disqualified (no Commit)')
      }
    }

    throwIfStopped(signal)
    await sleep(RATE_LIMIT_MS, signal)
    let current = getLead(id)!
    if (current.super_team_id && (force || needsEnrich(current, false))) {
      log(`#${id}: enrich`)
      try {
        await enrichFromCommitApi(current)
        current = getLead(id)!
        log(
          `  2a: name=${current.team_name} email=${current.contact_email ?? '(none)'}`,
        )
        if (!current.contact_email && current.website_url) {
          await sleep(RATE_LIMIT_MS, signal)
          await enrichFromSiteContactPages(current)
          current = getLead(id)!
          log(
            `  site: email=${current.contact_email ?? '(none)'} source=${current.contact_source ?? '(none)'}`,
          )
        }
        current = getLead(id)!
        if (
          current.super_team_id &&
          (current.status === 'new' ||
            current.status === 'identified' ||
            current.status === 'researched')
        ) {
          updateLead(id, { status: 'researched' })
        }
        log(`  status → ${getLead(id)!.status}`)
      } catch (err) {
        if (err instanceof JobStoppedError) throw err
        log(`  error: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else if (!current.super_team_id) {
      log(`#${id}: skip enrich (no Commit id)`)
    } else {
      log(`#${id}: skip enrich (already done)`)
    }

    throwIfStopped(signal)
    await sleep(RATE_LIMIT_MS, signal)
    current = getLead(id)!
    if (current.super_team_id && (force || needsScore(current, false))) {
      log(`#${id}: score`)
      try {
        const result = await scoreLead(current)
        if (result) {
          log(`  fit=${result.fit_score} buyer=${result.buyer_guess}`)
          log(`  status → ${getLead(id)!.status}`)
        } else {
          log('  skipped (Ollama unavailable or empty response)')
        }
      } catch (err) {
        if (err instanceof JobStoppedError) throw err
        log(`  error: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else if (!current.super_team_id) {
      log(`#${id}: skip score (no Commit id)`)
    } else {
      log(`#${id}: skip score (already done)`)
    }

    log('Process one complete')
  } catch (err) {
    if (err instanceof JobStoppedError) {
      log('Stopped — finished steps keep their updated status')
      return
    }
    throw err
  }
}

/** Never fingerprinted yet (confidence unset). */
export function needsFingerprint(
  lead: Lead,
  force = false,
): boolean {
  if (!lead.website_url) return false
  if (force) return true
  return lead.confidence == null
}

/** Has Commit id and not yet enrich-completed. */
export function needsEnrich(lead: Lead, force = false): boolean {
  if (!lead.super_team_id) return false
  if (force) return true
  // Identified / still new, or only have USA Swimming registrar contact
  return (
    lead.status === 'new' ||
    lead.status === 'identified' ||
    lead.contact_source === 'usa_swimming'
  )
}

/** Commit club enriched enough to score, missing fit score. */
export function needsScore(lead: Lead, force = false): boolean {
  if (!lead.super_team_id) return false
  if (lead.status === 'disqualified') return false
  if (force) return true
  return lead.fit_score == null
}

/**
 * Researched (or force-drafted) Commit leads ready for 3-touch outreach copy.
 * researched = enrich done; drafted = all 3 touches present.
 */
export function needsDraft(lead: Lead, force = false): boolean {
  if (!lead.super_team_id || !lead.contact_email) return false
  if (lead.status === 'disqualified' || lead.status === 'lost') return false
  if (
    lead.status !== 'researched' &&
    lead.status !== 'drafted' &&
    !(force && (lead.status === 'identified' || lead.status === 'contacted'))
  ) {
    return false
  }
  if (force) return true
  return !allTouchesReady(getOutreachDrafts(lead))
}

async function applyFingerprint(
  lead: Lead,
  log: LogFn,
): Promise<void> {
  const fp = await fingerprintSite(lead.website_url!)
  let evidence =
    fp.evidence.length > 0
      ? fp.evidence.join('; ')
      : 'fingerprinted:no_commit'

  const patch: Parameters<typeof updateLead>[1] = {
    evidence,
    confidence: fp.confidence,
  }

  if (fp.superTeamId) {
    const owner = findLeadBySuperTeamId(fp.superTeamId)
    if (owner && owner.id !== lead.id) {
      evidence = `${evidence}; duplicate_of:#${owner.id}`
      patch.evidence = evidence
      // Duplicate of another lead — not a separate prospect
      if (lead.status === 'new' || lead.status === 'identified' || lead.status === 'researched') {
        patch.status = 'disqualified'
      }
      log(
        `  scanned=${fp.scannedUrl} confidence=${fp.confidence} id=${fp.superTeamId} (already on #${owner.id} — duplicate row, not writing id)`,
      )
      updateLead(lead.id, patch)
      return
    }
    patch.super_team_id = fp.superTeamId
    // Commit found — mark identified until enrich sets researched
    if (lead.status === 'new' || lead.status === 'identified') {
      patch.status = 'identified'
    }
  } else if (
    lead.status === 'new' ||
    lead.status === 'identified' ||
    lead.status === 'researched'
  ) {
    // Looked at site; no Commit → not a prospect for this pipeline
    patch.status = 'disqualified'
  }

  updateLead(lead.id, patch)
  log(
    `  scanned=${fp.scannedUrl} confidence=${fp.confidence} id=${fp.superTeamId ?? '(none)'} evidence=${evidence}`,
  )
}

export async function runFingerprint(
  arg: string | number | undefined,
  log: LogFn = console.log,
  signal?: AbortSignal,
): Promise<void> {
  const leads = resolveLeads(arg)
  log(`Fingerprint: ${leads.length} lead(s)`)
  try {
    for (let i = 0; i < leads.length; i++) {
      throwIfStopped(signal)
      const lead = leads[i]
      if (!lead.website_url) {
        log(`#${lead.id}: skip (no website_url)`)
        continue
      }
      log(`#${lead.id}: fingerprint ${lead.website_url} (${i + 1}/${leads.length})`)
      try {
        await applyFingerprint(lead, log)
        log(`  status → ${getLead(lead.id)!.status}`)
      } catch (err) {
        if (err instanceof JobStoppedError) throw err
        log(`  error: ${err instanceof Error ? err.message : String(err)}`)
      }
      if (i < leads.length - 1) await sleep(RATE_LIMIT_MS, signal)
    }
    log('Fingerprint complete')
  } catch (err) {
    if (err instanceof JobStoppedError) {
      log('Stopped — finished leads keep their updated status')
      return
    }
    throw err
  }
}

export async function runEnrich(
  arg: string | number | undefined,
  log: LogFn = console.log,
  signal?: AbortSignal,
): Promise<void> {
  const leads = resolveLeads(arg)
  log(`Enrich: ${leads.length} lead(s)`)
  try {
    for (let i = 0; i < leads.length; i++) {
      throwIfStopped(signal)
      let lead = leads[i]
      log(
        `#${lead.id}: enrich ${lead.team_name ?? lead.website_url ?? lead.super_team_id} (${i + 1}/${leads.length})`,
      )
      try {
        if (lead.super_team_id) {
          await enrichFromCommitApi(lead)
          lead = getLead(lead.id)!
          log(
            `  2a: name=${lead.team_name} email=${lead.contact_email ?? '(none)'} tz=${lead.timezone ?? '(none)'}`,
          )
        } else {
          log('  skip 2a (no super_team_id — run fingerprint first)')
        }

        if (!lead.contact_email && lead.website_url) {
          await sleep(RATE_LIMIT_MS, signal)
          await enrichFromSiteContactPages(lead)
          lead = getLead(lead.id)!
          log(
            `  site: email=${lead.contact_email ?? '(none)'} source=${lead.contact_source ?? '(none)'}`,
          )
        }
        const after = getLead(lead.id)!
        if (
          after.super_team_id &&
          (after.status === 'new' ||
            after.status === 'identified' ||
            after.status === 'researched')
        ) {
          updateLead(after.id, { status: 'researched' })
        }
        log(`  status → ${getLead(lead.id)!.status}`)
      } catch (err) {
        if (err instanceof JobStoppedError) throw err
        log(`  error: ${err instanceof Error ? err.message : String(err)}`)
      }
      if (i < leads.length - 1) await sleep(RATE_LIMIT_MS, signal)
    }
    log('Enrich complete')
  } catch (err) {
    if (err instanceof JobStoppedError) {
      log('Stopped — finished leads keep their updated status')
      return
    }
    throw err
  }
}

export async function runScore(
  arg: string | number | undefined,
  log: LogFn = console.log,
  signal?: AbortSignal,
): Promise<void> {
  const leads = resolveLeads(arg)
  log(`Score: ${leads.length} lead(s)`)
  try {
    for (let i = 0; i < leads.length; i++) {
      throwIfStopped(signal)
      const lead = leads[i]
      log(
        `#${lead.id}: score ${lead.team_name ?? lead.website_url} (${i + 1}/${leads.length})`,
      )
      const result = await scoreLead(lead)
      if (result) {
        log(`  fit=${result.fit_score} buyer=${result.buyer_guess}`)
        log(`  status → ${getLead(lead.id)!.status}`)
      }
      if (i < leads.length - 1) await sleep(RATE_LIMIT_MS, signal)
    }
    log('Score complete')
  } catch (err) {
    if (err instanceof JobStoppedError) {
      log('Stopped — finished leads keep their updated status')
      return
    }
    throw err
  }
}

/**
 * Bulk-generate 3-touch outreach drafts for researched leads missing copy.
 * Sets status → drafted when all three touches exist.
 */
export async function runDraftPending(
  options: {
    limit?: number
    forceReprocess?: boolean
    signal?: AbortSignal
  } = {},
  log: LogFn = console.log,
): Promise<void> {
  const force = options.forceReprocess === true
  const limit = Math.max(1, Math.min(options.limit ?? 25, 1000))
  const signal = options.signal
  const batch = listLeads()
    .filter((l) => needsDraft(l, force))
    .slice(0, limit)

  log(
    `Draft queue: ${batch.length} lead(s) (limit=${limit}, force=${force}). Each gets touches 1→2→3 from Commit calendar + Ollama.`,
  )
  if (batch.length === 0) {
    log('Nothing pending — filter status researched (or force drafted).')
    return
  }

  try {
    for (let i = 0; i < batch.length; i++) {
      throwIfStopped(signal)
      const lead = batch[i]
      const missing = missingTouches(getOutreachDrafts(lead))
      log(
        `#${lead.id}: draft ${lead.team_name ?? lead.super_team_id} (${i + 1}/${batch.length}) missing=[${missing.join(',') || 'none — regenerating all'}]`,
      )
      try {
        const result = await draftOutreachSequence(lead, {
          touches: force ? [1, 2, 3] : missing.length ? missing : [1, 2, 3],
          force,
          onProgress: log,
        })
        log(
          `  generated touches: [${result.generated.join(', ') || 'none'}] → status ${result.status}`,
        )
        if (result.failed.length) {
          log(
            `  failed touches: ${result.failed.map((f) => `${f.touch} (${f.error})`).join('; ')}`,
          )
        }
        if (result.scheduleError) log(`  schedule note: ${result.scheduleError}`)
      } catch (err) {
        if (err instanceof JobStoppedError) throw err
        log(`  error: ${err instanceof Error ? err.message : String(err)}`)
      }
      if (i < batch.length - 1) await sleep(RATE_LIMIT_MS, signal)
    }
    log('Draft queue complete')
  } catch (err) {
    if (err instanceof JobStoppedError) {
      log('Stopped — finished leads keep their drafts')
      return
    }
    throw err
  }
}

/** Generate / regenerate outreach drafts for one lead (touches 1–3 or a subset). */
export async function runDraftOne(
  id: number,
  options: {
    touches?: Array<1 | 2 | 3>
    force?: boolean
    signal?: AbortSignal
  } = {},
  log: LogFn = console.log,
): Promise<void> {
  const signal = options.signal
  const lead = getLead(id)
  if (!lead) {
    log(`Lead #${id} not found`)
    return
  }
  throwIfStopped(signal)
  const touches = options.touches?.length
    ? options.touches
    : ([1, 2, 3] as Array<1 | 2 | 3>)
  const force = options.force !== false
  log(
    `#${id}: draft touches [${touches.join(', ')}] force=${force} — ${lead.team_name ?? ''}`,
  )
  const result = await draftOutreachSequence(lead, {
    touches,
    force,
    onProgress: log,
  })
  log(
    `  generated: [${result.generated.join(', ') || 'none'}] → status ${result.status}`,
  )
  if (result.failed.length) {
    log(
      `  failed: ${result.failed.map((f) => `${f.touch} (${f.error})`).join('; ')}`,
    )
  }
}

export function runExport(
  path?: string,
  log: LogFn = console.log,
): string {
  const out = exportCsv(path)
  log(`Exported ${listLeads().length} leads → ${out}`)
  return out
}

export function getSummary() {
  repairScannedStatuses()
  const leads = listLeads()
  return {
    total: leads.length,
    statusCounts: statusCounts(),
    withEmail: leads.filter((l) => l.contact_email).length,
    withSuperTeamId: leads.filter((l) => l.super_team_id).length,
    withFitScore: leads.filter((l) => l.fit_score != null).length,
    pendingFingerprint: leads.filter((l) => needsFingerprint(l, false))
      .length,
    pendingEnrich: leads.filter((l) => needsEnrich(l, false)).length,
    pendingScore: leads.filter((l) => needsScore(l, false)).length,
    pendingDraft: leads.filter((l) => needsDraft(l, false)).length,
  }
}

export function searchLeads(query: string): Lead[] {
  const q = query.trim().toLowerCase()
  const leads = listLeads()
  if (!q) return leads
  return leads.filter((l) => {
    const hay = [
      l.team_name,
      l.website_url,
      l.super_team_id,
      l.contact_email,
      l.region_notes,
      l.status,
      l.buyer_guess,
      l.fit_notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}
