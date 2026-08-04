/**
 * Manual / legacy entry: weekly digests only.
 * Still gated by Sunday + each tenant’s local weeklySendHour unless ?force=1.
 *
 * Prefer the hourly /api/cron/send-digests tick in production.
 */
import { runSendDigests } from './send-digests.js'

export default async function handler(req, res) {
  const force =
    req.query?.force === '1' ||
    req.query?.force === 'true' ||
    req.query?.force === true
  return runSendDigests(req, res, { frequency: 'weekly', force })
}
