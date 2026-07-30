import type { Lead } from './db.js'
import { updateLead } from './db.js'
import { chatJson, OllamaUnavailableError } from './ollama.js'

export interface ScoreResult {
  fit_score: number
  fit_notes: string
  buyer_guess: string
  draft_email: string
  objections: string[]
}

const SYSTEM = `You are a B2B sales researcher for Commit Companion Calendar (CCC),
a mobile-first weekly practice/meet calendar for swim teams already using Commit Swimming.
Return ONLY valid JSON with keys:
fit_score (0-100), fit_notes (string), buyer_guess (string),
draft_email (string, short personalized first outreach), objections (string array).
Prefer team/office contacts. Do not invent email addresses.`

export async function scoreLead(lead: Lead): Promise<ScoreResult | null> {
  const user = `Score this Commit swim team lead for CCC outreach.

Team name: ${lead.team_name ?? 'unknown'}
Website: ${lead.website_url ?? 'unknown'}
Timezone: ${lead.timezone ?? 'unknown'}
Contact email: ${lead.contact_email ?? 'unknown'}
Contact phone: ${lead.contact_phone ?? 'unknown'}
Contact source: ${lead.contact_source ?? 'unknown'}
Evidence they use Commit: ${lead.evidence ?? 'unknown'}
Confidence: ${lead.confidence ?? 'unknown'}
Region notes: ${lead.region_notes ?? 'none'}

Product angle: They already run Commit — CCC gives families a mobile-first week view.
Proof: live Delmar Dolphins calendar. Offer a free pilot for one team.
Target buyer priority: team admin/office, head coach, website coordinator, board president.

Return JSON only.`

  try {
    const result = await chatJson<ScoreResult>(SYSTEM, user)
    const fit = Math.max(0, Math.min(100, Number(result.fit_score) || 0))
    const patch = {
      fit_score: fit,
      fit_notes: [
        result.fit_notes,
        Array.isArray(result.objections) && result.objections.length
          ? `Objections: ${result.objections.join('; ')}`
          : null,
      ]
        .filter(Boolean)
        .join('\n'),
      draft_email: result.draft_email?.trim() || null,
      buyer_guess: result.buyer_guess?.trim() || null,
      status:
        lead.status === 'new' ||
        lead.status === 'identified' ||
        lead.status === 'researched'
          ? ('researched' as const)
          : lead.status,
    }
    updateLead(lead.id, patch)
    return { ...result, fit_score: fit }
  } catch (err) {
    if (err instanceof OllamaUnavailableError) {
      console.warn(`  skip score (Ollama): ${err.message}`)
      return null
    }
    throw err
  }
}
