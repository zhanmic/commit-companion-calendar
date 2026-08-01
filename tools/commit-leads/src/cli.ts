#!/usr/bin/env node
import {
  getSummary,
  runEnrich,
  runExport,
  runFingerprint,
  runProcessPending,
  runScore,
  runSeed,
  runUsaDiscover,
} from './jobs.js'

function usage(): never {
  console.log(`commit-leads — discover Commit swim teams and contacts

Usage:
  npm run cli -- usas [--no-contacts] [--refresh] [--force]
  npm run cli -- usas --state NY --query Delmar   # optional filters
  npm run cli -- process [--limit 25] [--force] [--fingerprint-only|--enrich-only|--score-only]
  npm run cli -- seed [path/to/seeds.csv]
  npm run cli -- fingerprint [id|all]
  npm run cli -- enrich [id|all]
  npm run cli -- score [id|all]
  npm run cli -- export [path]
  npm run cli -- status
  npm run ui

Discover: usas / manual / seed — add clubs to the DB.
Process:  fingerprint → enrich → score (process does all three on pending rows).
`)
  process.exit(1)
}

function parseUsaArgs(argv: string[]) {
  const out: {
    state?: string
    query?: string
    zip?: string
    limit?: number
    includeContacts: boolean
    forceRefresh: boolean
    forceReimport: boolean
  } = {
    includeContacts: true,
    forceRefresh: false,
    forceReimport: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--state') out.state = argv[++i]
    else if (a === '--query') out.query = argv[++i]
    else if (a === '--zip') out.zip = argv[++i]
    else if (a === '--limit') out.limit = Number(argv[++i])
    else if (a === '--no-contacts') out.includeContacts = false
    else if (a === '--refresh') out.forceRefresh = true
    else if (a === '--force') out.forceReimport = true
    else if (a === '--help') usage()
  }
  return out
}

function parseProcessArgs(argv: string[]) {
  const out: {
    limit?: number
    fingerprint?: boolean
    enrich?: boolean
    score?: boolean
    forceReprocess?: boolean
  } = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--limit') out.limit = Number(argv[++i])
    else if (a === '--force') out.forceReprocess = true
    else if (a === '--fingerprint-only') {
      out.fingerprint = true
      out.enrich = false
      out.score = false
    } else if (a === '--enrich-only') {
      out.fingerprint = false
      out.enrich = true
      out.score = false
    } else if (a === '--score-only') {
      out.fingerprint = false
      out.enrich = false
      out.score = true
    }
  }
  return out
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv
  if (!cmd) usage()

  switch (cmd) {
    case 'seed':
      await runSeed(rest[0])
      break
    case 'usas':
    case 'usa':
    case 'discover':
      await runUsaDiscover(parseUsaArgs(rest))
      break
    case 'process':
      await runProcessPending(parseProcessArgs(rest))
      break
    case 'fingerprint':
      await runFingerprint(rest[0])
      break
    case 'enrich':
      await runEnrich(rest[0])
      break
    case 'score':
      await runScore(rest[0])
      break
    case 'export':
      runExport(rest[0])
      break
    case 'status': {
      const s = getSummary()
      console.log(`Total leads: ${s.total}`)
      for (const [status, n] of Object.entries(s.statusCounts).sort()) {
        console.log(`  ${status}: ${n}`)
      }
      console.log(`  with contact email: ${s.withEmail}`)
      console.log(`  with superTeamId: ${s.withSuperTeamId}`)
      console.log(`  pending fingerprint: ${s.pendingFingerprint}`)
      console.log(`  pending enrich: ${s.pendingEnrich}`)
      console.log(`  pending score: ${s.pendingScore}`)
      break
    }
    case 'help':
    case '--help':
    case '-h':
      usage()
      break
    default:
      console.error(`Unknown command: ${cmd}`)
      usage()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
