import { config as loadEnv } from 'dotenv'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const toolRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

loadEnv({ path: join(toolRoot, '.env') })

export const TOOL_ROOT = toolRoot
export const DATA_DIR = join(toolRoot, 'data')
export const DB_PATH = join(DATA_DIR, 'leads.sqlite')
export const SEEDS_PATH = join(DATA_DIR, 'seeds.csv')
export const SEEDS_EXAMPLE_PATH = join(toolRoot, 'seeds.example.csv')
export const EXPORT_PATH = join(DATA_DIR, 'leads-export.csv')

export const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1'
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.1'
export const RATE_LIMIT_MS = Number(process.env.RATE_LIMIT_MS ?? '1500')
export const PORT = Number(process.env.PORT ?? '3847')
/** Bind address. Use 0.0.0.0 to reach the UI from phone on same Wi‑Fi; 127.0.0.1 for Mac-only. */
export const HOST = process.env.HOST ?? '0.0.0.0'

/** Main product site (screenshots / overview) for outreach drafts. */
export const SITE_URL = process.env.SITE_URL ?? 'https://myswimday.com'

/** Live Delmar demo calendar URL for outreach drafts. */
export const DEMO_CALENDAR_URL =
  process.env.DEMO_CALENDAR_URL ??
  'https://myswimday.com/DelmarDolphins?week=2026-07-19'

/** Sign-off used in generated outreach drafts. */
export const SENDER_NAME =
  process.env.SENDER_NAME ?? 'Mic Zhan from MySwimDay'

/** Mail.app From identity (must already exist on the account). */
export const MAIL_FROM =
  process.env.MAIL_FROM ?? 'sales@mail.myswimday.com'

/** One-line peer credibility for outreach (swim parent angle). */
export const SENDER_CONTEXT =
  process.env.SENDER_CONTEXT ??
  'I am a parent of four swimmers at Delmar Dolphins.'

/** Headless Chromium network capture (DevTools-style). Set FINGERPRINT_NETWORK=0 to disable. */
export const FINGERPRINT_NETWORK = !['0', 'false', 'no'].includes(
  (process.env.FINGERPRINT_NETWORK ?? '1').toLowerCase(),
)

export function ensureDataDir(): void {
  mkdirSync(DATA_DIR, { recursive: true })
}

export class JobStoppedError extends Error {
  constructor(message = 'Stopped by user') {
    super(message)
    this.name = 'JobStoppedError'
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new JobStoppedError())
      return
    }
    const t = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new JobStoppedError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
