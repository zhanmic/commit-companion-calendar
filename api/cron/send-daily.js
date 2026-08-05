/**
 * Manual / legacy entry: daily digests only.
 * Gated by local hour >= dailySendHour unless ?force=1.
 *
 * Prefer the /api/cron/send-digests UTC-hour ticks in production.
 */
import { queryParam } from '../_lib/http.js'
import { runSendDigests } from './send-digests.js'

export default async function handler(req, res) {
  const force =
    queryParam(req, 'force') === '1' || queryParam(req, 'force') === 'true'
  return runSendDigests(req, res, { frequency: 'daily', force })
}
