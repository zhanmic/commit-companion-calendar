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
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text
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
