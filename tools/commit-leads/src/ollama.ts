import { OLLAMA_BASE_URL, OLLAMA_MODEL } from './config.js'

export class OllamaUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OllamaUnavailableError'
  }
}

export async function chatJson<T>(
  system: string,
  user: string,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        temperature: 0.3,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
  } catch (err) {
    throw new OllamaUnavailableError(
      `Ollama unreachable at ${OLLAMA_BASE_URL}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 404 || res.status >= 500) {
      throw new OllamaUnavailableError(
        `Ollama error ${res.status}: ${body.slice(0, 200)}`,
      )
    }
    throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('Empty Ollama response')

  const jsonText = extractJson(content)
  return JSON.parse(jsonText) as T
}

function extractJson(text: string): string {
  // Prefer fenced blocks that look like our draft/score payload
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
  for (let i = fences.length - 1; i >= 0; i--) {
    const candidate = fences[i][1].trim()
    if (looksLikeJsonObject(candidate)) return candidate
  }

  // Thinking models often emit braces before the real payload — take the
  // last top-level object that parses and has expected keys when possible.
  const objects = extractJsonObjects(text)
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i]
    if (/"subject"\s*:/.test(obj) || /"fit_score"\s*:/.test(obj) || /"body"\s*:/.test(obj)) {
      return obj
    }
  }
  if (objects.length) return objects[objects.length - 1]

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text
}

function looksLikeJsonObject(text: string): boolean {
  if (!text.startsWith('{')) return false
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/** Pull balanced `{...}` slices from text (best-effort). */
function extractJsonObjects(text: string): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue
    let depth = 0
    let inString = false
    let escape = false
    for (let j = i; j < text.length; j++) {
      const ch = text[j]
      if (inString) {
        if (escape) escape = false
        else if (ch === '\\') escape = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') {
        inString = true
        continue
      }
      if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          const slice = text.slice(i, j + 1)
          if (looksLikeJsonObject(slice)) out.push(slice)
          i = j
          break
        }
      }
    }
  }
  return out
}

export async function isOllamaUp(): Promise<boolean> {
  try {
    const base = OLLAMA_BASE_URL.replace(/\/v1\/?$/, '')
    const res = await fetch(`${base}/api/tags`)
    return res.ok
  } catch {
    return false
  }
}
