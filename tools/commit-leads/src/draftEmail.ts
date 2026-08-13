import type { Lead } from './db.js'
import { getLead } from './db.js'
import {
  DEMO_CALENDAR_URL,
  JobStoppedError,
  SENDER_CONTEXT,
  SENDER_NAME,
  SITE_URL,
} from './config.js'
import { ensureHtmlDraftBody } from './emailHtml.js'
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
  formatHumanDate,
  ymdInZone,
} from './monthCalendar.js'
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
Introduce My Swim Day in 1–2 sentences using the product facts below (do not paste a feature list).
Early in the email, include ONE short peer line from sender context (Delmar Dolphins parent of four)
to relate — not a biography. Use 1–2 real calendar facts with correct tense vs TODAY (past = already happened; future = still ahead).
Soft CTA for a free pilot / quick look at their Commit schedule. Do not mention prior emails.`,
  2: `TOUCH 2 — follow-up (~5–7 days after touch 1 if no reply).
Assume they may have seen touch 1. New angle — not "just bumping". Prefer one of:
  - email digests (daily morning / weekly) so parents catch last-night coach changes before practice
  - multi-group filter chaos / meet week / share-one-link for admins
You may briefly allude to being a swim parent if natural; do not repeat the full Delmar/four-swimmers line.
Shorter than touch 1. Soft CTA.`,
  3: `TOUCH 3 — close-the-loop (~10–14 days after touch 2 if no reply).
Final polite note. "Happy to shelve if timing is bad." Leave door open for fall. Very short.
Do not re-introduce the parent bio or re-pitch every feature. No guilt, no pressure.`,
}

function systemForTouch(touch: OutreachTouch): string {
  return `You write short, personalized cold outreach for My Swim Day (MySwimDay).

Product facts (match current homepage — pick 1–2 per email, do not dump all):
- Headline idea: view and share the practice schedule in seconds.
- Syncs with Commit Swimming (practices, meets, team events stay in sync). Not a new scheduling system.
- Mobile week view coaches and families actually open. No login, no app — just open the link.
- Group filters + one-tap share links.
- NEW: parents/coaches can subscribe to daily or weekly email digests (morning digest catches overnight Commit changes before practice).
- Built for Commit teams: coaches update Commit once; admins share one live link; parents open the week or subscribe.
- Not affiliated with Commit Swimming — do not claim partnership/official status.

You will receive TODAY's date plus an expanded Commit calendar review (past ~30 days + next ~14 days).
Dates before today are PAST. Dates after today are FUTURE. Never call a past meet, banquet, or championship "upcoming".

Study that window, then write ONE email for the specified touch in a 3-email sequence.

${TOUCH_BRIEF[touch]}

Return ONLY valid JSON with keys:
- subject (string, specific, under 70 chars)
- body (string, HTML email fragment — NOT plain text; touch 1: 90–160 words; touch 2: 70–120; touch 3: 50–90)
- customization_hooks (string array, 2–4 concrete ideas citing real calendar facts when possible)

HTML body rules:
- Use simple tags only: <p>, <br>, <a href="...">, <strong>, <em>. No <html>/<body>, no CSS, no tables, no images.
- Wrap paragraphs in <p>…</p>. Use <br> sparingly inside a paragraph.
- Product links MUST be real anchors, e.g. <a href="${SITE_URL}">Product overview</a> and <a href="${DEMO_CALENDAR_URL}">Live Delmar demo</a>.
- Mentioning "MySwimDay" or "Delmar demo" without an <a href> is not enough.

Other rules:
- Open with the team name. Do NOT invent a person's first name from an email local-part.
- Do not invent contacts, meets, or practice groups.
- Use real calendar details when available; if the forward (after today) calendar is empty (common mid-summer), use recent PAST activity in past tense + fall framing, and lean on the product screenshots + live Delmar demo links.
- NEVER describe an event on or before TODAY as upcoming, coming up, or "your team's upcoming X".
- Sign off as the provided sender name (include "from MySwimDay" in the sign-off if not already in the name). Put the sign-off in its own <p>.
- Use the provided sender context exactly once in touch 1 (peer credibility as a Delmar Dolphins parent). Keep it to one sentence; do not invent kids' names, ages, or group placements.
- Contact email is ONLY the message To: address (already set when opening Mail). NEVER paste it into the body. NEVER tell them to email their own address, "reply to [their email]", or "email …@… with questions." CTA is simply reply to this email.
- No emojis. Peer tone to office/admin / fellow swim parents.`
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
  const tz = lead.timezone?.trim() || 'America/New_York'
  const now = new Date()
  const todayYmd = ymdInZone(now, tz)
  const todayHuman = formatHumanDate(now, tz)
  const priorNote =
    touch === 1
      ? 'No prior emails in this sequence yet.'
      : `Prior touches already drafted (for continuity — do not copy them):\n${summarizePrior(prior, touch)}`

  return `Draft outreach TOUCH ${touch} for this Commit swim team lead.

TODAY IS ${todayHuman} (${todayYmd}) in timezone ${tz}.
This is the current date. Compare every meet/event date to it before writing.

Sender sign-off (use exactly): ${SENDER_NAME}
Sender context (peer line — use in touch 1 once; paraphrase lightly only if needed): ${SENDER_CONTEXT}

REQUIRED HTML links — include both as <a href> anchors (exact URLs):
1) Main site / screenshots: <a href="${SITE_URL}">Product overview</a>
2) Live Delmar demo: <a href="${DEMO_CALENDAR_URL}">Live Delmar Dolphins demo</a>
Example paragraph:
<p>Product overview: <a href="${SITE_URL}">${SITE_URL}</a><br>
Live Delmar demo: <a href="${DEMO_CALENDAR_URL}">${DEMO_CALENDAR_URL}</a></p>

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
  signal?: AbortSignal,
): Promise<TouchDraft> {
  if (signal?.aborted) throw new JobStoppedError()
  const result = await chatJson<LlmDraft>(
    systemForTouch(touch),
    userPrompt(lead, touch, schedule, prior),
    signal,
  )
  const body = ensureHtmlDraftBody(
    scrubLeadEmailFromBody(
      (result.body || result.draft_email || '').trim(),
      lead.contact_email,
    ),
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

/** @deprecated use ensureHtmlDraftBody — kept for backfill scripts */
export function ensureProductLinks(body: string): string {
  return ensureHtmlDraftBody(body)
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
  signal?: AbortSignal,
): Promise<DraftResult> {
  const { schedule, scheduleError } = await loadSchedule(lead)
  let drafts = getOutreachDrafts(lead)

  try {
    const generated = await generateOneTouch(
      lead,
      touch,
      schedule,
      drafts,
      signal,
    )
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
    signal?: AbortSignal
  } = {},
): Promise<SequenceResult> {
  const force = options.force === true
  const signal = options.signal
  const wanted = (options.touches?.length
    ? options.touches
    : ([1, 2, 3] as OutreachTouch[])
  ).filter((t): t is OutreachTouch => [1, 2, 3].includes(t))
  const progress = options.onProgress

  if (signal?.aborted) throw new JobStoppedError()

  const { schedule, scheduleError } = await loadSchedule(lead)
  let drafts = getOutreachDrafts(lead)
  const generated: OutreachTouch[] = []
  const failed: Array<{ touch: OutreachTouch; error: string }> = []

  progress?.(
    `Draft sequence for #${lead.id}: touches [${wanted.join(', ')}] force=${force}`,
  )

  for (const touch of wanted) {
    if (signal?.aborted) {
      progress?.('  stopped by user')
      throw new JobStoppedError()
    }
    const key = String(touch) as '1' | '2' | '3'
    if (!force && drafts[key]?.body?.trim()) {
      progress?.(`  touch ${touch}: skip (already present)`)
      continue
    }
    progress?.(`  touch ${touch}: generating…`)
    try {
      // Reload lead-local prior each time so touch 2/3 see freshly saved copy
      const one = await generateOneTouch(
        lead,
        touch,
        schedule,
        drafts,
        signal,
      )
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
      if (err instanceof JobStoppedError) throw err
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
  if (touch === 2) return `Re: email digests for ${team} families`
  if (touch === 3) return `Closing the loop — ${team}`
  return `View ${team}'s practice week in seconds`
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
