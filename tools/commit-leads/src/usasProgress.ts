import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { DATA_DIR, ensureDataDir } from './config.js'
import { join } from 'node:path'

const PROGRESS_PATH = join(DATA_DIR, 'usas-progress.json')

/** US states + DC, roughly largest → smallest club counts for batching. */
export const USAS_STATES = [
  'CA', 'FL', 'TX', 'PA', 'NY', 'IL', 'IN', 'OH', 'NJ', 'MI',
  'VA', 'NC', 'CO', 'GA', 'WA', 'MD', 'MA', 'WI', 'MN', 'AZ',
  'CT', 'TN', 'MO', 'OR', 'SC', 'LA', 'KY', 'AL', 'OK', 'IA',
  'KS', 'UT', 'NV', 'AR', 'NE', 'NM', 'HI', 'ID', 'WV', 'NH',
  'ME', 'RI', 'MT', 'SD', 'ND', 'AK', 'WY', 'VT', 'DE', 'MS', 'DC',
] as const

export interface UsasProgress {
  importedStates: string[]
  lastImportAt: string | null
  lastState: string | null
  lastCreated: number
  lastSkipped: number
}

function emptyProgress(): UsasProgress {
  return {
    importedStates: [],
    lastImportAt: null,
    lastState: null,
    lastCreated: 0,
    lastSkipped: 0,
  }
}

export function loadUsasProgress(): UsasProgress {
  ensureDataDir()
  if (!existsSync(PROGRESS_PATH)) return emptyProgress()
  try {
    const raw = JSON.parse(readFileSync(PROGRESS_PATH, 'utf8')) as UsasProgress
    return {
      ...emptyProgress(),
      ...raw,
      importedStates: Array.isArray(raw.importedStates)
        ? raw.importedStates.map((s) => String(s).toUpperCase())
        : [],
    }
  } catch {
    return emptyProgress()
  }
}

export function saveUsasProgress(progress: UsasProgress): void {
  ensureDataDir()
  writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2), 'utf8')
}

export function markStateImported(
  state: string,
  stats: { created: number; skipped: number },
): UsasProgress {
  const progress = loadUsasProgress()
  const code = state.toUpperCase()
  if (!progress.importedStates.includes(code)) {
    progress.importedStates.push(code)
  }
  progress.lastImportAt = new Date().toISOString()
  progress.lastState = code
  progress.lastCreated = stats.created
  progress.lastSkipped = stats.skipped
  saveUsasProgress(progress)
  return progress
}

/** Next state in USAS_STATES that has not been imported yet. */
export function nextUnimportedState(): string | null {
  const { importedStates } = loadUsasProgress()
  const done = new Set(importedStates)
  return USAS_STATES.find((s) => !done.has(s)) ?? null
}

export function usasProgressSummary() {
  const progress = loadUsasProgress()
  const remaining = USAS_STATES.filter(
    (s) => !progress.importedStates.includes(s),
  )
  return {
    ...progress,
    totalStates: USAS_STATES.length,
    remainingStates: remaining,
    remainingCount: remaining.length,
    nextState: remaining[0] ?? null,
  }
}
