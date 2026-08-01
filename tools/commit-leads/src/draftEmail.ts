import type { Lead } from './db.js'
import { getLead } from './db.js'
import { DEMO_CALENDAR_URL, SENDER_NAME, SITE_URL } from './config.js'
import { chatJson, OllamaUnavailableError } from './ollama.js'
import {
  getOutreachDrafts,
  saveOutreachDrafts,
  setTouchDraft,
  type OutreachDrafts,
  type OutreachTouch,
  type TouchDraft,
} from './outreachDrafts.js'
import {
  formatScheduleForPrompt,
  loadScheduleContext,
  type ScheduleContext,
} from './scheduleContext.js'

export interface DraftResult {
  subject: string
  body: string
  customization_hooks: string[]
  touch: OutreachTouch
  drafts: OutreachDrafts
  schedule: ScheduleContext | null
  scheduleError: string | null
}

export interface SequenceResult {
  drafts: OutreachDrafts
  generated: OutreachTouch[]
  failed: Array<{ touch: OutreachTouch; error: string }>
  schedule: ScheduleContext | null
  scheduleError: string | null
  status: Lead['status'] | undefined
}

interface LlmDraft {
  subject?: string
  body?: string
  draft_email?: string
  customization_hooks?: string[]
  hooks?: string[]
}

const TOUCH_BRIEF: Record<OutreachTouch, string> = {
  1: `TOUCH 1 — first outreach (Day 0).
Introduce MySwimDay briefly. Use 1–2 real calendar facts. Soft CTA for a free pilot / quick look.
Do not mention prior emails.`,
  2: `TOUCH 2 — follow-up (~5–7 days after touch 1 if no reply).
Assume they may have seen touch 1. New angle (parent chaos / meet week / multi-group schedule) — not "just bumping".
Shorter than touch 1. Soft CTA.`,
  3: `TOUCH 3 — close-the-loop (~10–14 days after touch 2 if no reply).
Final polite note. "Happy to shelve if timing is bad." Leave door open for fall. Very short.
No guilt, no pressure.`,
}

function systemForTouch(touch: OutreachTouch): string {
  return `You write short, personalized cold outreach for MySwimDay.
Product: mobile-first weekly practice/meet calendar for swim teams already on Commit Swimming.

You will receive an expanded Commit calendar review (past ~30 days + next ~14 days).
Study that window, then write ONE email for the specified touch in a 3-email sequence.

${TOUCH_BRIEF[touch]}

Return ONLY valid JSON with keys:
- subject (string, specific, under 70 chars)
- body (string, plain text, touch 1: 90–160 words; touch 2: 70–120; touch 3: 50–90)
- customization_hooks (string array, 2–4 concrete ideas citing real calendar facts when possible)

Rules:
- Open with the team name. Do NOT invent a person's first name from an email local-part.
- Do not invent contacts, meets, or practice groups.
- Use real calendar details when available; if forward calendar is empty (common mid-summer), use recent activity + fall framing, and lean on the product screenshots + live Delmar demo links.
- Include BOTH links exactly once each, with a short label for each:
  1) Main site (screenshots / product overview)
  2) Live Delmar Dolphins demo (may still show a fuller schedule than a typical mid-summer week)
- Sign off as the provided sender name (include "from MySwimDay" in the sign-off if not already in the name).
- Contact email is ONLY the message To: address (already set when opening Mail). NEVER paste it into the body. NEVER tell them to email their own address, "reply to [their email]", or "email …@… with questions." CTA is simply reply to this email.
- No emojis. Peer tone to office/admin.`
}

function parseRegionBits(regionNotes: string | null): string {
  if (!regionNotes) return 'none'
  return regionNotes.slice(0, 400)
}

function userPrompt(
  lead: Lead,
  touch: OutreachTouch,
  schedule: ScheduleContext | null,
  prior: OutreachDrafts,
): string {
  const priorNote =
    touch === 1
      ? 'No prior emails in this sequence yet.'
      : `Prior touches already drafted (for continuity — do not copy them):\n${summarizePrior(prior, touch)}`

  return `Draft outreach TOUCH ${touch} for this Commit swim team lead.

Sender sign-off (use exactly): ${SENDER_NAME}

Links to include (both, once each, with a short plain-text label):
1) Main site / screenshots: ${SITE_URL}
   — for product overview and screenshots (useful when live calendars are quiet mid-summer)
2) Live Delmar demo: ${DEMO_CALENDAR_URL}
   — clickable week view so they can experience the product live

Team name: ${lead.team_name ?? 'unknown'}
Website: ${lead.website_url ?? 'unknown'}
Timezone: ${lead.timezone ?? 'unknown'}
Contact email (Mail To: field only — do NOT put this address in the email body): ${lead.contact_email ?? 'unknown'}
Contact source: ${lead.contact_source ?? 'unknown'}
Fit score / buyer guess: ${lead.fit_score ?? '—'} / ${lead.buyer_guess ?? '—'}
Fit notes: ${lead.fit_notes ?? 'none'}
Region / USA Swimming notes: ${parseRegionBits(lead.region_notes)}

${formatScheduleForPrompt(schedule)}

${priorNote}

Return JSON only for touch ${touch}.`
}

function summarizePrior(prior: OutreachDrafts, upTo: OutreachTouch): string {
  const lines: string[] = []
  for (const t of [1, 2, 3] as OutreachTouch[]) {
    if (t >= upTo) break
    const d = prior[String(t) as '1' | '2' | '3']
    if (!d?.body) {
      lines.push(`Touch ${t}: (missing)`)
      continue
    }
    lines.push(
      `Touch ${t} subject: ${d.subject}\nTouch ${t} body preview: ${d.body.slice(0, 220)}…`,
    )
  }
  return lines.join('\n\n') || '(none)'
}

async function loadSchedule(
  lead: Lead,
): Promise<{ schedule: ScheduleContext | null; scheduleError: string | null }> {
  if (!lead.super_team_id) {
    return {
      schedule: null,
      scheduleError: 'No superTeamId — cannot load Commit schedule',
    }
  }
  try {
    return {
      schedule: await loadScheduleContext(lead.super_team_id, lead.timezone),
      scheduleError: null,
    }
  } catch (err) {
    return {
      schedule: null,
      scheduleError: err instanceof Error ? err.message : String(err),
    }
  }
}

async function generateOneTouch(
  lead: Lead,
  touch: OutreachTouch,
  schedule: ScheduleContext | null,
  prior: OutreachDrafts,
): Promise<TouchDraft> {
  const result = await chatJson<LlmDraft>(
    systemForTouch(touch),
    userPrompt(lead, touch, schedule, prior),
  )
  const body = scrubLeadEmailFromBody(
    (result.body || result.draft_email || '').trim(),
    lead.contact_email,
  )
  const subject =
    (result.subject || '').trim() || defaultSubject(lead, touch)
  const hooks = normalizeHooks(result.customization_hooks ?? result.hooks)
  if (!body) throw new Error(`Ollama returned empty body for touch ${touch}`)
  return {
    subject,
    body,
    hooks,
    generatedAt: new Date().toISOString(),
  }
}

/** Model sometimes pastes the To: address into the body — strip that. */
function scrubLeadEmailFromBody(
  body: string,
  contactEmail: string | null,
): string {
  if (!body || !contactEmail?.includes('@')) return body
  const escaped = contactEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let out = body.replace(new RegExp(escaped, 'gi'), '')
  // Clean common leftover phrases after removal
  out = out
    .replace(
      /\s*(?:or\s+)?email\s+with questions\.?/gi,
      '',
    )
    .replace(
      /\s*Reply anytime,?\s*\.?\s*/gi,
      ' Reply anytime. ',
    )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  return out
}

/** Generate one touch (1/2/3). Updates status to drafted when all three exist. */
export async function draftOutreachEmail(
  lead: Lead,
  touch: OutreachTouch = 1,
): Promise<DraftResult> {
  const { schedule, scheduleError } = await loadSchedule(lead)
  let drafts = getOutreachDrafts(lead)

  try {
    const generated = await generateOneTouch(lead, touch, schedule, drafts)
    drafts = setTouchDraft(drafts, touch, generated)
    saveOutreachDrafts(lead.id, drafts, {
      markDrafted: true,
      currentStatus: lead.status,
    })
    const after = getLead(lead.id)
    return {
      subject: generated.subject,
      body: generated.body,
      customization_hooks: generated.hooks,
      touch,
      drafts,
      schedule,
      scheduleError,
    }
  } catch (err) {
    if (err instanceof OllamaUnavailableError) throw err
    throw err
  }
}

/**
 * Generate missing touches (or all if force). Used by bulk queue and "generate all".
 * Order: 1 → 2 → 3 so follow-ups see prior drafts.
 * Continues after a single-touch failure so 2/3 are not abandoned if 1 succeeds.
 */
export async function draftOutreachSequence(
  lead: Lead,
  options: {
    touches?: OutreachTouch[]
    force?: boolean
    onProgress?: (line: string) => void
  } = {},
): Promise<SequenceResult> {
  const force = options.force === true
  const wanted = (options.touches?.length
    ? options.touches
    : ([1, 2, 3] as OutreachTouch[])
  ).filter((t): t is OutreachTouch => [1, 2, 3].includes(t))
  const progress = options.onProgress

  const { schedule, scheduleError } = await loadSchedule(lead)
  let drafts = getOutreachDrafts(lead)
  const generated: OutreachTouch[] = []
  const failed: Array<{ touch: OutreachTouch; error: string }> = []

  progress?.(
    `Draft sequence for #${lead.id}: touches [${wanted.join(', ')}] force=${force}`,
  )

  for (const touch of wanted) {
    const key = String(touch) as '1' | '2' | '3'
    if (!force && drafts[key]?.body?.trim()) {
      progress?.(`  touch ${touch}: skip (already present)`)
      continue
    }
    progress?.(`  touch ${touch}: generating…`)
    try {
      // Reload lead-local prior each time so touch 2/3 see freshly saved copy
      const one = await generateOneTouch(lead, touch, schedule, drafts)
      drafts = setTouchDraft(drafts, touch, one)
      generated.push(touch)
      saveOutreachDrafts(lead.id, drafts, {
        markDrafted: false,
        currentStatus: getLead(lead.id)?.status ?? lead.status,
      })
      // Re-read in case another writer touched the row
      drafts = getOutreachDrafts(getLead(lead.id)!)
      progress?.(
        `  touch ${touch}: ok (${one.subject.slice(0, 48)}${one.subject.length > 48 ? '…' : ''})`,
      )
    } catch (err) {
      if (err instanceof OllamaUnavailableError) throw err
      const message = err instanceof Error ? err.message : String(err)
      failed.push({ touch, error: message })
      progress?.(`  touch ${touch}: FAILED — ${message}`)
    }
  }

  saveOutreachDrafts(lead.id, drafts, {
    markDrafted: true,
    currentStatus: getLead(lead.id)?.status ?? lead.status,
  })

  const after = getLead(lead.id)
  progress?.(
    `  done: generated=[${generated.join(',') || 'none'}] failed=[${
      failed.map((f) => f.touch).join(',') || 'none'
    }] status=${after?.status}`,
  )

  return {
    drafts: getOutreachDrafts(after!),
    generated,
    failed,
    schedule,
    scheduleError,
    status: after?.status,
  }
}

function defaultSubject(lead: Lead, touch: OutreachTouch): string {
  const team = lead.team_name?.trim() || 'your team'
  if (touch === 2) return `Re: parent calendar idea for ${team}`
  if (touch === 3) return `Closing the loop — ${team}`
  return `Quick idea for ${team} families (Commit calendar)`
}

function normalizeHooks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is string => typeof x === 'string' && !!x.trim())
    .map((x) => x.trim())
    .slice(0, 6)
}

export function parseDraftHooks(raw: string | null): string[] {
  return normalizeHooks(
    (() => {
      if (!raw) return []
      try {
        return JSON.parse(raw)
      } catch {
        return []
      }
    })(),
  )
}

export { getOutreachDrafts }
export type { OutreachTouch, OutreachDrafts }
