import { DatabaseSync } from 'node:sqlite'
import { DB_PATH, ensureDataDir } from './config.js'

export type LeadStatus =
  | 'new'
  | 'identified'
  | 'researched'
  | 'drafted'
  | 'contacted'
  | 'replied'
  | 'demo'
  | 'disqualified'
  | 'won'
  | 'lost'

export type ContactSource =
  | 'websiteConfig'
  | 'site_html'
  | 'manual'
  | 'usa_swimming'
  | null

export interface Lead {
  id: number
  team_name: string | null
  website_url: string | null
  super_team_id: string | null
  timezone: string | null
  contact_email: string | null
  contact_phone: string | null
  contact_address: string | null
  contact_source: ContactSource
  evidence: string | null
  confidence: number | null
  fit_score: number | null
  fit_notes: string | null
  draft_email: string | null
  draft_subject: string | null
  draft_hooks: string | null
  /** JSON: { "1"|"2"|"3": { subject, body, hooks, generatedAt } } */
  outreach_drafts: string | null
  buyer_guess: string | null
  status: LeadStatus
  region_notes: string | null
  updated_at: string
}

let db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (db) return db
  ensureDataDir()
  db = new DatabaseSync(DB_PATH)
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_name TEXT,
      website_url TEXT,
      super_team_id TEXT,
      timezone TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      contact_address TEXT,
      contact_source TEXT,
      evidence TEXT,
      confidence REAL,
      fit_score INTEGER,
      fit_notes TEXT,
      draft_email TEXT,
      buyer_guess TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      region_notes TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_website
      ON leads(website_url) WHERE website_url IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_super_team
      ON leads(super_team_id) WHERE super_team_id IS NOT NULL;
  `)
  ensureColumn(db, 'draft_subject', 'TEXT')
  ensureColumn(db, 'draft_hooks', 'TEXT')
  ensureColumn(db, 'outreach_drafts', 'TEXT')
  // One-time style repair each open is cheap
  db.prepare(
    `UPDATE leads
     SET status = 'disqualified', updated_at = ?
     WHERE status = 'new'
       AND confidence IS NOT NULL
       AND super_team_id IS NULL`,
  ).run(nowIso())
  // Commit found but still labeled "new" → identified (awaiting enrich)
  db.prepare(
    `UPDATE leads
     SET status = 'identified', updated_at = ?
     WHERE status = 'new'
       AND super_team_id IS NOT NULL`,
  ).run(nowIso())
  return db
}

function nowIso(): string {
  return new Date().toISOString()
}

function ensureColumn(
  database: DatabaseSync,
  name: string,
  typeSql: string,
): void {
  const cols = database.prepare('PRAGMA table_info(leads)').all() as unknown as {
    name: string
  }[]
  if (cols.some((c) => c.name === name)) return
  database.exec(`ALTER TABLE leads ADD COLUMN ${name} ${typeSql}`)
}

export function normalizeUrl(url: string): string {
  try {
    const raw = url.trim()
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    const u = new URL(withProto)
    if (u.protocol === 'http:') u.protocol = 'https:'
    u.hash = ''
    // Drop default ports; lowercase host
    u.hostname = u.hostname.toLowerCase()
    if (u.hostname.startsWith('www.')) {
      // keep www as-is for uniqueness with existing rows; still unify scheme
    }
    let href = u.href
    if (href.endsWith('/')) href = href.slice(0, -1)
    return href
  } catch {
    return url.trim()
  }
}

export interface SeedRow {
  team_name?: string
  website_url?: string
  super_team_id?: string
  region_notes?: string
  contact_email?: string
  contact_phone?: string
  contact_address?: string
  contact_source?: Exclude<ContactSource, null>
}

export function upsertSeed(row: SeedRow): { id: number; created: boolean } {
  const database = getDb()
  const website = row.website_url ? normalizeUrl(row.website_url) : null
  const superId = row.super_team_id?.trim() || null

  let existing: { id: number } | undefined
  if (superId) {
    existing = database
      .prepare('SELECT id FROM leads WHERE super_team_id = ?')
      .get(superId) as unknown as { id: number } | undefined
  }
  if (!existing && website) {
    existing = database
      .prepare('SELECT id FROM leads WHERE website_url = ?')
      .get(website) as unknown as { id: number } | undefined
  }

  if (existing) {
    database
      .prepare(
        `UPDATE leads SET
          team_name = COALESCE(?, team_name),
          website_url = COALESCE(?, website_url),
          super_team_id = COALESCE(?, super_team_id),
          region_notes = COALESCE(?, region_notes),
          contact_email = COALESCE(contact_email, ?),
          contact_phone = COALESCE(contact_phone, ?),
          contact_address = COALESCE(contact_address, ?),
          contact_source = COALESCE(contact_source, ?),
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        row.team_name?.trim() || null,
        website,
        superId,
        row.region_notes?.trim() || null,
        row.contact_email?.trim() || null,
        row.contact_phone?.trim() || null,
        row.contact_address?.trim() || null,
        row.contact_source ?? null,
        nowIso(),
        existing.id,
      )
    return { id: existing.id, created: false }
  }

  const result = database
    .prepare(
      `INSERT INTO leads (
        team_name, website_url, super_team_id, region_notes,
        contact_email, contact_phone, contact_address, contact_source,
        status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
    )
    .run(
      row.team_name?.trim() || null,
      website,
      superId,
      row.region_notes?.trim() || null,
      row.contact_email?.trim() || null,
      row.contact_phone?.trim() || null,
      row.contact_address?.trim() || null,
      row.contact_source ?? null,
      nowIso(),
    )
  return { id: Number(result.lastInsertRowid), created: true }
}

export function findLeadByWebsite(websiteUrl: string): Lead | undefined {
  const website = normalizeUrl(websiteUrl)
  const hit = getDb()
    .prepare('SELECT * FROM leads WHERE website_url = ?')
    .get(website) as unknown as Lead | undefined
  if (hit) return hit
  // Also try http twin / without forcing https again
  const alt =
    website.startsWith('https://')
      ? `http://${website.slice('https://'.length)}`
      : website.startsWith('http://')
        ? `https://${website.slice('http://'.length)}`
        : null
  if (!alt) return undefined
  return getDb()
    .prepare('SELECT * FROM leads WHERE website_url = ?')
    .get(alt) as unknown as Lead | undefined
}

export function findLeadBySuperTeamId(superTeamId: string): Lead | undefined {
  return getDb()
    .prepare('SELECT * FROM leads WHERE super_team_id = ?')
    .get(superTeamId.trim()) as unknown as Lead | undefined
}

export function getLead(id: number): Lead | undefined {
  return getDb()
    .prepare('SELECT * FROM leads WHERE id = ?')
    .get(id) as unknown as Lead | undefined
}

export function listLeads(): Lead[] {
  return getDb()
    .prepare('SELECT * FROM leads ORDER BY id ASC')
    .all() as unknown as Lead[]
}

export function updateLead(
  id: number,
  fields: Partial<Omit<Lead, 'id'>>,
): void {
  const keys = Object.keys(fields) as (keyof typeof fields)[]
  if (keys.length === 0) return
  const sets = keys.map((k) => `${k} = ?`).join(', ')
  const values = keys.map((k) => fields[k] ?? null)
  getDb()
    .prepare(`UPDATE leads SET ${sets}, updated_at = ? WHERE id = ?`)
    .run(...values, nowIso(), id)
}

/**
 * Fingerprinted with no Commit id → disqualified.
 * Commit id found but still "new" → identified.
 */
export function repairScannedStatuses(): number {
  const database = getDb()
  const noCommit = database
    .prepare(
      `UPDATE leads
       SET status = 'disqualified', updated_at = ?
       WHERE status = 'new'
         AND confidence IS NOT NULL
         AND super_team_id IS NULL`,
    )
    .run(nowIso())
  const withCommit = database
    .prepare(
      `UPDATE leads
       SET status = 'identified', updated_at = ?
       WHERE status = 'new'
         AND super_team_id IS NOT NULL`,
    )
    .run(nowIso())
  return Number(noCommit.changes ?? 0) + Number(withCommit.changes ?? 0)
}

export function statusCounts(): Record<string, number> {
  const rows = getDb()
    .prepare('SELECT status, COUNT(*) AS n FROM leads GROUP BY status')
    .all() as unknown as { status: string; n: number }[]
  const out: Record<string, number> = {}
  for (const row of rows) out[row.status] = row.n
  return out
}
