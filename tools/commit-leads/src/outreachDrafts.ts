import type { Lead } from './db.js'
import { updateLead } from './db.js'
import { ensureHtmlDraftBody } from './emailHtml.js'

export type OutreachTouch = 1 | 2 | 3

export interface TouchDraft {
  subject: string
  body: string
  hooks: string[]
  generatedAt: string
}

export type OutreachDrafts = Partial<Record<'1' | '2' | '3', TouchDraft>>

export function parseOutreachDrafts(raw: string | null | undefined): OutreachDrafts {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as OutreachDrafts
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function withHtmlBodies(drafts: OutreachDrafts): OutreachDrafts {
  const out: OutreachDrafts = {}
  for (const key of ['1', '2', '3'] as const) {
    const d = drafts[key]
    if (!d) continue
    out[key] = {
      ...d,
      body: d.body?.trim() ? ensureHtmlDraftBody(d.body) : d.body,
    }
  }
  return out
}

/** Prefer JSON sequence; fall back to legacy draft_* columns as touch 1. */
export function getOutreachDrafts(lead: Lead): OutreachDrafts {
  const fromJson = parseOutreachDrafts(lead.outreach_drafts)
  if (fromJson['1']?.body) return withHtmlBodies(fromJson)
  if (lead.draft_email?.trim()) {
    return withHtmlBodies({
      ...fromJson,
      '1': {
        subject: lead.draft_subject?.trim() || '',
        body: lead.draft_email.trim(),
        hooks: parseHooks(lead.draft_hooks),
        generatedAt: lead.updated_at,
      },
    })
  }
  return withHtmlBodies(fromJson)
}

function parseHooks(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : []
  } catch {
    return []
  }
}

export function hasTouch(drafts: OutreachDrafts, touch: OutreachTouch): boolean {
  return !!drafts[String(touch) as '1' | '2' | '3']?.body?.trim()
}

export function missingTouches(drafts: OutreachDrafts): OutreachTouch[] {
  return ([1, 2, 3] as OutreachTouch[]).filter((t) => !hasTouch(drafts, t))
}

export function allTouchesReady(drafts: OutreachDrafts): boolean {
  return missingTouches(drafts).length === 0
}

/** Persist sequence + keep legacy touch-1 columns in sync for CSV/export. */
export function saveOutreachDrafts(
  leadId: number,
  drafts: OutreachDrafts,
  opts?: { markDrafted?: boolean; currentStatus?: Lead['status'] },
): void {
  const touch1 = drafts['1']
  const patch: Parameters<typeof updateLead>[1] = {
    outreach_drafts: JSON.stringify(drafts),
    draft_email: touch1?.body?.trim() || null,
    draft_subject: touch1?.subject?.trim() || null,
    draft_hooks: touch1 ? JSON.stringify(touch1.hooks ?? []) : null,
  }

  if (opts?.markDrafted && allTouchesReady(drafts)) {
    const s = opts.currentStatus
    if (!s || s === 'researched' || s === 'drafted' || s === 'identified') {
      patch.status = 'drafted'
    }
  }

  updateLead(leadId, patch)
}

export function setTouchDraft(
  drafts: OutreachDrafts,
  touch: OutreachTouch,
  draft: Omit<TouchDraft, 'generatedAt'> & { generatedAt?: string },
): OutreachDrafts {
  return {
    ...drafts,
    [String(touch)]: {
      subject: draft.subject.trim(),
      body: draft.body.trim(),
      hooks: draft.hooks ?? [],
      generatedAt: draft.generatedAt ?? new Date().toISOString(),
    },
  }
}
