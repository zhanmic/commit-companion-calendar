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
