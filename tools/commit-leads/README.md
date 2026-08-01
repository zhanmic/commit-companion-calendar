# Commit Leads

**Local-only** CLI + web UI to find swim teams using [Commit Swimming](https://www.commitswimming.com), capture published office contacts, draft outreach with Ollama, and export a sales CSV.

This tool is **not** part of the Vercel / `myswimday.com` deploy. Run it on your Mac (Node 22+, optional Ollama, optional Playwright). SQLite, `.env`, and `data/` stay on disk and are gitignored.

## Setup

```bash
cd tools/commit-leads
npm install
cp .env.example .env   # set OLLAMA_MODEL to a model you have (e.g. qwen3:8b)
```

Requires Node 22+ (uses built-in `node:sqlite`). Ollama optional until you run `score`.

Fingerprint’s browser pass uses Playwright Chromium (installed via `postinstall`) to catch Commit API calls the way DevTools Network does. Disable with `FINGERPRINT_NETWORK=0`.

## Pipeline steps

| Section | Purpose |
|---------|---------|
| **1 · Discover** | Import USA Swimming clubs and/or add leads manually (side by side). |
| **2 · Process** | Queue: fingerprint → enrich → score → **researched**. **Generate drafts** (bulk): calendar + Ollama → touches 1–3 → **drafted**. One-lead regenerate for any touch. |
| **3 · Leads** | Browse/filter by status, edit a touch, open Mac Mail, mark **contacted**, export CSV. |

USA Swimming’s Find a Team API returns the **full national directory in one download** (~4MB, cached 24h). Re-running Discover only adds new clubs (unless Force re-import).

```text
Discover: usas | manual | seed CSV
                ↓
Process:  process pending → fingerprint → enrich → score
                ↓
Draft:    researched → Generate drafts (bulk or one) → drafted
Leads:    edit touch 1/2/3 → Mail.app → contacted → export CSV
```

Fingerprint is what filters for **Commit** users among USA Swimming clubs.

### Status meaning

| Status | Meaning |
|--------|---------|
| `researched` | Enrich done (Commit contact). Ready for draft generation — **not** “email written”. |
| `drafted` | Touches **1, 2, and 3** generated from calendar + Ollama. Ready to send. |
| `contacted` | You sent outreach (touch 1). |

### Outreach

1. Get leads to **researched** (Run queue / enrich).
2. **Generate drafts** (bulk) — uses batch size; each lead gets touch 1→2→3 → **drafted**. Or **Regenerate draft(s)** for one lead.
3. Open a **drafted** lead → pick touch tab → edit → **Open in Mail** → send yourself → **Mark contacted** (or Open Mail + contacted).
4. Later: send touch 2 / 3 from the same lead (same tabs); status can stay `contacted`.

Set in `.env` before drafting: `SITE_URL` (screenshots), `DEMO_CALENDAR_URL` (live Delmar), `SENDER_NAME` (default: Mic Zhan from MySwimDay).

## Web UI (local)

```bash
npm run ui
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847). Bind defaults to `0.0.0.0` so a phone on the same Wi‑Fi can use `http://<mac-lan-ip>:3847`. Discover and Process can run together; the leads table updates as batches finish.

**Open in Mail** uses macOS Mail.app via `osascript` on the machine running the server.
## CLI

```bash
npm run cli -- usas                 # full import (~2400 with websites)
npm run cli -- usas --force         # re-import even if already in DB
npm run cli -- usas --refresh       # re-download directory cache
npm run cli -- process --limit 25
npm run cli -- fingerprint all
npm run cli -- enrich all
npm run cli -- score all
npm run cli -- export
npm run cli -- status
```

Optional filters: `--state NY`, `--query Delmar`, `--zip 12054`, `--limit 100`, `--no-contacts`.

## Seeds

Edit `data/seeds.csv` (gitignored). Columns:

```text
team_name,website_url,super_team_id,region_notes
```

Start from `seeds.example.csv` (includes Delmar Dolphins).

## Compliance

- Prefer `websiteConfig.contact` (team/office) over coach personal inboxes.
- Respect rate limits (`RATE_LIMIT_MS`), robots.txt, and applicable email laws (CAN-SPAM / CASL).
- Human-in-the-loop for sends — this tool does not send email.
- Do not brute-force `superTeamId` values.

## Data

All under `data/` (gitignored): `leads.sqlite`, `seeds.csv`, `leads-export.csv`, `usas-clubs-cache.json`.
