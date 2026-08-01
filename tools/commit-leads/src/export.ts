import { writeFileSync } from 'node:fs'
import { EXPORT_PATH, ensureDataDir } from './config.js'
import { listLeads, type Lead } from './db.js'

const COLUMNS: (keyof Lead)[] = [
  'id',
  'team_name',
  'website_url',
  'super_team_id',
  'timezone',
  'contact_email',
  'contact_phone',
  'contact_address',
  'contact_source',
  'evidence',
  'confidence',
  'fit_score',
  'fit_notes',
  'draft_email',
  'draft_subject',
  'draft_hooks',
  'outreach_drafts',
  'buyer_guess',
  'status',
  'region_notes',
  'updated_at',
]

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function exportCsv(path = EXPORT_PATH): string {
  ensureDataDir()
  const leads = listLeads()
  const lines = [
    COLUMNS.join(','),
    ...leads.map((lead) =>
      COLUMNS.map((col) => csvEscape(lead[col])).join(','),
    ),
  ]
  writeFileSync(path, lines.join('\n') + '\n', 'utf8')
  return path
}
