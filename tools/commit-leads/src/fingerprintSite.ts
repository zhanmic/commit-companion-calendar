import { FINGERPRINT_NETWORK, RATE_LIMIT_MS, sleep } from './config.js'
import { fetchPageHtml, fingerprintHtml, type FingerprintResult } from './fingerprint.js'
import { fingerprintViaNetwork } from './fingerprintNetwork.js'

const EXTRA_PATHS = [
  '/schedule',
  '/calendar',
  '/events',
  '/team-schedule',
  '/practices',
]

function candidatePages(websiteUrl: string): string[] {
  const pages = new Set<string>([websiteUrl])
  try {
    const origin = new URL(websiteUrl).origin
    for (const p of EXTRA_PATHS) pages.add(`${origin}${p}`)
  } catch {
    // keep base only
  }
  return [...pages]
}

function isBetter(
  next: FingerprintResult,
  best: FingerprintResult,
): boolean {
  if (next.superTeamId && !best.superTeamId) return true
  if (next.confidence > best.confidence) return true
  return false
}

/**
 * Fingerprint a site: static HTML first, then (optional) headless browser
 * network capture — same idea as DevTools → Network for Commit API calls.
 */
export async function fingerprintSite(
  websiteUrl: string,
): Promise<FingerprintResult & { scannedUrl: string }> {
  let best: FingerprintResult & { scannedUrl: string } = {
    superTeamId: null,
    confidence: 0,
    evidence: [],
    scannedUrl: websiteUrl,
  }

  const pages = candidatePages(websiteUrl)

  // Pass 1: cheap static HTML / linked scripts
  for (let i = 0; i < pages.length; i++) {
    const url = pages[i]
    try {
      const html = await fetchPageHtml(url)
      const fp = fingerprintHtml(html)
      const scriptSrcs = [
        ...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi),
      ].map((m) => m[1])
      for (const src of scriptSrcs) {
        if (/commit/i.test(src)) {
          fp.evidence.push(`script:${src.slice(0, 120)}`)
          fp.confidence = Math.min(1, fp.confidence + 0.15)
          try {
            const abs = new URL(src, url).href
            const scriptBody = await fetchPageHtml(abs)
            const nested = fingerprintHtml(scriptBody)
            if (nested.superTeamId && !fp.superTeamId) {
              fp.superTeamId = nested.superTeamId
            }
            fp.evidence.push(...nested.evidence.map((e) => `js:${e}`))
            fp.confidence = Math.min(
              1,
              Math.round((fp.confidence + nested.confidence * 0.5) * 100) / 100,
            )
          } catch {
            // ignore script fetch failures
          }
        }
      }

      if (isBetter(fp, best)) {
        best = { ...fp, scannedUrl: url }
      }
      if (fp.superTeamId && fp.confidence >= 0.7) break
    } catch {
      // soft-fail per page
    }
    if (i < pages.length - 1) await sleep(Math.min(RATE_LIMIT_MS, 800))
  }

  if (best.superTeamId && best.confidence >= 0.7) return best
  if (!FINGERPRINT_NETWORK) return best

  // Pass 2: headless Chromium watches network (DevTools-style)
  for (const url of pages) {
    try {
      const fp = await fingerprintViaNetwork(url)
      if (fp.evidence.includes('network:playwright_not_installed')) {
        best = {
          ...best,
          evidence: [
            ...(best.evidence ?? []),
            'network:skipped_install_playwright',
          ],
        }
        break
      }
      if (isBetter(fp, best)) {
        best = fp
      }
      if (fp.superTeamId && fp.confidence >= 0.7) break
    } catch (err) {
      best = {
        ...best,
        evidence: [
          ...(best.evidence ?? []),
          `network:error:${err instanceof Error ? err.message : String(err)}`.slice(
            0,
            160,
          ),
        ],
      }
    }
    await sleep(Math.min(RATE_LIMIT_MS, 800))
  }

  return best
}
