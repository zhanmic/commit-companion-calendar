import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface OpenMailInput {
  to: string | null
  subject: string
  body: string
}

export interface OpenMailResult {
  ok: boolean
  method: 'mail_app' | 'none'
  message: string
}

function escapeAppleScript(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

/** Create a visible draft in macOS Mail.app (server must run on the Mac). */
export async function openMailDraft(
  input: OpenMailInput,
): Promise<OpenMailResult> {
  if (process.platform !== 'darwin') {
    return {
      ok: false,
      method: 'none',
      message: 'Mail.app open only works when the leads server runs on macOS',
    }
  }

  const subject = escapeAppleScript(input.subject || '')
  const body = escapeAppleScript(input.body || '')
  const to = (input.to || '').trim()

  const recipientLine = to
    ? `tell newMessage
      make new to recipient at end of to recipients with properties {address:"${escapeAppleScript(to)}"}
    end tell`
    : ''

  const script = `
tell application "Mail"
  set newMessage to make new outgoing message with properties {subject:"${subject}", content:"${body}", visible:true}
  ${recipientLine}
  activate
end tell
`

  try {
    await execFileAsync('osascript', ['-e', script], {
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    })
    return {
      ok: true,
      method: 'mail_app',
      message: to
        ? `Opened Mail draft to ${to}`
        : 'Opened Mail draft (add recipient manually)',
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      method: 'none',
      message: `Could not open Mail.app: ${detail.slice(0, 240)}`,
    }
  }
}

/** Browser-safe mailto URL (length-limited; prefer Mail.app for long bodies). */
export function buildMailtoUrl(input: OpenMailInput): string | null {
  const to = (input.to || '').trim()
  if (!to || !to.includes('@')) return null
  const params = new URLSearchParams()
  if (input.subject) params.set('subject', input.subject)
  if (input.body) params.set('body', input.body)
  const url = `mailto:${to}?${params.toString()}`
  // Practical client limit; UI can still copy body if too long
  if (url.length > 1800) return null
  return url
}
