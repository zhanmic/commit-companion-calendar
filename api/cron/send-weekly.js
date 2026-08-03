/**
 * Vercel Cron: weekly digests.
 * Schedule: 0 22 * * 0 (Sunday ≈ 6pm Eastern)
 */
import { runSendDigests } from './send-digests.js'

export default async function handler(req, res) {
  return runSendDigests(req, res, 'weekly')
}
