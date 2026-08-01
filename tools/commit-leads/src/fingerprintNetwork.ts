import type { FingerprintResult } from './fingerprint.js'
import { fingerprintHtml } from './fingerprint.js'

const COMMIT_HOST = /utility\.commitswimming\.com/i
const SUPER_ID_IN_URL = /[?&]superTeamId=([A-Za-z0-9_-]{10,})/i

/**
 * Load a page in headless Chromium and watch the network (like DevTools)
 * for Commit website-data-2a/2b calls → extract superTeamId.
 */
export async function fingerprintViaNetwork(
  url: string,
  options: { timeoutMs?: number; waitMs?: number } = {},
): Promise<FingerprintResult & { scannedUrl: string }> {
  const timeoutMs = options.timeoutMs ?? 25_000
  const waitMs = options.waitMs ?? 4_000

  let playwright: typeof import('playwright')
  try {
    playwright = await import('playwright')
  } catch {
    return {
      superTeamId: null,
      confidence: 0,
      evidence: ['network:playwright_not_installed'],
      scannedUrl: url,
    }
  }

  const evidence = new Set<string>()
  const ids = new Set<string>()
  let confidence = 0

  const browser = await playwright.chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()

    page.on('request', (req) => {
      const reqUrl = req.url()
      if (!COMMIT_HOST.test(reqUrl)) return

      if (/website-data-2a/i.test(reqUrl)) {
        evidence.add('network:website-data-2a')
        confidence += 0.45
      }
      if (/website-data-2b/i.test(reqUrl)) {
        evidence.add('network:website-data-2b')
        confidence += 0.45
      }
      evidence.add('network:commitswimming-api')
      confidence += 0.15

      const match = SUPER_ID_IN_URL.exec(reqUrl)
      if (match) ids.add(match[1])
    })

    page.on('response', async (res) => {
      const resUrl = res.url()
      if (!COMMIT_HOST.test(resUrl)) return
      try {
        const ct = res.headers()['content-type'] ?? ''
        if (!ct.includes('json')) return
        const json = (await res.json()) as {
          superTeam?: { _id?: string }
        }
        if (json?.superTeam?._id) ids.add(json.superTeam._id)
      } catch {
        // ignore non-JSON / aborted
      }
    })

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    })
    await new Promise((r) => setTimeout(r, waitMs))

    // Also scan rendered DOM / scripts after JS runs
    const html = await page.content()
    const staticFp = fingerprintHtml(html)
    for (const e of staticFp.evidence) evidence.add(`dom:${e}`)
    confidence += staticFp.confidence * 0.4
    if (staticFp.superTeamId) ids.add(staticFp.superTeamId)
  } finally {
    await browser.close()
  }

  const idList = [...ids]
  let superTeamId: string | null = null
  if (idList.length === 1) {
    superTeamId = idList[0]
    evidence.add(`superTeamId:${superTeamId}`)
    confidence += 0.5
  } else if (idList.length > 1) {
    superTeamId = idList[0]
    evidence.add(`superTeamId_candidates:${idList.join(',')}`)
    confidence += 0.35
  }

  if ([...evidence].some((e) => e.startsWith('network:'))) {
    confidence = Math.max(confidence, superTeamId ? 0.95 : 0.6)
  }

  return {
    superTeamId,
    confidence: Math.min(1, Math.round(confidence * 100) / 100),
    evidence: [...evidence],
    scannedUrl: url,
  }
}
