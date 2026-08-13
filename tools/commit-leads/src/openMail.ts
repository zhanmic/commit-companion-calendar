import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  htmlToPlainText,
  looksLikeHtml,
  wrapEmailHtmlDocument,
} from './emailHtml.js'

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
  const rawBody = input.body || ''
  const isHtml = looksLikeHtml(rawBody)
  const plainBody = escapeAppleScript(
    isHtml ? htmlToPlainText(rawBody) : rawBody,
  )
  const htmlDoc = escapeAppleScript(
    wrapEmailHtmlDocument(isHtml ? rawBody : rawBody.replace(/\n/g, '<br>\n')),
  )
  const to = (input.to || '').trim()

  const recipientBlock = to
    ? `tell newMessage
      make new to recipient at end of to recipients with properties {address:"${escapeAppleScript(to)}"}
    end tell`
    : ''

  const script = `
tell application "Mail"
  set newMessage to make new outgoing message with properties {subject:"${subject}", content:"${plainBody}", visible:true}
  ${recipientBlock}
  try
    set html content of newMessage to "${htmlDoc}"
  end try
  activate
end tell
`

  const dir = await mkdtemp(join(tmpdir(), 'commit-leads-mail-'))
  const scriptPath = join(dir, `${randomUUID()}.applescript`)
  try {
    await writeFile(scriptPath, script, 'utf8')
    await execFileAsync('osascript', [scriptPath], {
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
    })
    return {
      ok: true,
      method: 'mail_app',
      message: to
        ? `Opened Mail draft to ${to} (HTML)`
        : 'Opened Mail draft (HTML; add recipient manually)',
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      method: 'none',
      message: `Could not open Mail.app: ${detail.slice(0, 240)}`,
    }
  } finally {
    await unlink(scriptPath).catch(() => {})
    await rmdir(dir).catch(() => {})
  }
}
