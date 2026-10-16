import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { MAIL_FROM, SENDER_NAME } from './config.js'
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
  /** Send immediately. Otherwise leave a visible Mail.app draft. */
  send?: boolean
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

/** Create a Mail.app message (server must run on macOS). Sends when `send` is set. */
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

  const rawBody = input.body || ''
  const isHtml = looksLikeHtml(rawBody)
  const plainBody = isHtml ? htmlToPlainText(rawBody) : rawBody
  const htmlDoc = wrapEmailHtmlDocument(
    isHtml ? rawBody : rawBody.replace(/\n/g, '<br>\n'),
  )
  const to = (input.to || '').trim()
  if (input.send && !to) {
    return {
      ok: false,
      method: 'none',
      message: 'No recipient — add an office email before sending',
    }
  }
  const fromAddr = MAIL_FROM.trim()
  const fromName = SENDER_NAME.trim()
  const senderValue = fromName
    ? `${fromName} <${fromAddr}>`
    : fromAddr
  const senderEsc = escapeAppleScript(senderValue)
  const fromAddrEsc = escapeAppleScript(fromAddr)

  const recipientBlock = to
    ? `tell newMessage
      make new to recipient at end of to recipients with properties {address:"${escapeAppleScript(to)}"}
    end tell`
    : ''

  // Bring Mail forward before creating the message. A compose window made
  // while Mail is in the background often never appears; setting HTML on a
  // hidden message also does not open a window.
  const finish = input.send
    ? `delay 1
  send newMessage`
    : `set visible of newMessage to true
  activate`

  const dir = await mkdtemp(join(tmpdir(), 'commit-leads-mail-'))
  const scriptPath = join(dir, `${randomUUID()}.applescript`)
  const subjectPath = join(dir, 'subject.txt')
  const plainPath = join(dir, 'plain.txt')
  const htmlPath = join(dir, 'body.html')
  const q = (filePath: string) => escapeAppleScript(filePath)
  const script = `
set subjectText to do shell script "cat " & quoted form of "${q(subjectPath)}"
set plainText to do shell script "cat " & quoted form of "${q(plainPath)}"
set htmlText to do shell script "cat " & quoted form of "${q(htmlPath)}"
tell application "Mail"
  activate
end tell
delay 0.3
tell application "Mail"
  set newMessage to make new outgoing message with properties {subject:subjectText, content:plainText, visible:${input.send ? 'false' : 'true'}}
  ${recipientBlock}
  try
    set sender of newMessage to "${senderEsc}"
  on error
    try
      set sender of newMessage to "${fromAddrEsc}"
    end try
  end try
  try
    set html content of newMessage to htmlText
  end try
  ${finish}
end tell
`
  try {
    await writeFile(subjectPath, input.subject || '', 'utf8')
    await writeFile(plainPath, plainBody, 'utf8')
    await writeFile(htmlPath, htmlDoc, 'utf8')
    await writeFile(scriptPath, script, 'utf8')
    await execFileAsync('osascript', [scriptPath], {
      timeout: input.send ? 60_000 : 15_000,
      maxBuffer: 2 * 1024 * 1024,
    })
    return {
      ok: true,
      method: 'mail_app',
      message: input.send
        ? `Sent to ${to} from ${fromAddr} (HTML)`
        : to
          ? `Opened Mail draft to ${to} from ${fromAddr} (HTML)`
          : `Opened Mail draft from ${fromAddr} (HTML; add recipient manually)`,
    }
  } catch (err) {
    const failed = err as NodeJS.ErrnoException & {
      stderr?: string
      killed?: boolean
    }
    const stderr = typeof failed.stderr === 'string' ? failed.stderr.trim() : ''
    const detail = failed.killed
      ? 'Timed out waiting for Mail.app'
      : stderr || (err instanceof Error ? err.message : String(err))
    return {
      ok: false,
      method: 'none',
      message: `Could not open Mail.app: ${detail.slice(0, 240)}`,
    }
  } finally {
    await unlink(scriptPath).catch(() => {})
    await unlink(subjectPath).catch(() => {})
    await unlink(plainPath).catch(() => {})
    await unlink(htmlPath).catch(() => {})
    await rmdir(dir).catch(() => {})
  }
}
