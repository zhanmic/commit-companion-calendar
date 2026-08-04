/**
 * Manual / legacy entry: daily digests only.
 * Still gated by each tenant’s local dailySendHour unless ?force=1.
 *
 * Prefer the /api/cron/send-digests UTC-hour ticks in production.
 */
import { runSendDigests } from './send-digests.js'

export default async function handler(req, res) {
  const force =
    req.query?.force === '1' ||
    req.query?.force === 'true' ||
    req.query?.force === true
  return runSendDigests(req, res, { frequency: 'daily', force })
}
