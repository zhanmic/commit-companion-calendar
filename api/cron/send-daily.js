/**
 * Vercel Cron: daily digests.
 * Schedule: 0 11 * * * (≈ 7am Eastern)
 */
import { runSendDigests } from './send-digests.js'

export default async function handler(req, res) {
  return runSendDigests(req, res, 'daily')
}
