# Commit Leads

**Local-only** CLI + web UI to find swim teams using [Commit Swimming](https://www.commitswimming.com), capture published office contacts, draft **HTML** outreach with Ollama, open drafts in Mac Mail, and export a sales CSV.

This tool is **not** part of the Vercel / `myswimday.com` deploy. Run it on your Mac (Node 22+, optional Ollama, optional Playwright). SQLite, `.env`, and `data/` stay on disk and are gitignored.

## Setup

```bash
cd tools/commit-leads
npm install
cp .env.example .env   # set OLLAMA_MODEL to a model you have (e.g. qwen3:8b)
```

Requires Node 22+ (uses built-in `node:sqlite`). Ollama optional until you run `score` / draft.

Fingerprint’s browser pass uses Playwright Chromium (installed via `postinstall`) to catch Commit API calls the way DevTools Network does. Disable with `FINGERPRINT_NETWORK=0`.

### Env (outreach)

| Variable | Purpose |
|----------|---------|
| `SITE_URL` | Product / screenshots link (default `https://myswimday.com`) |
| `DEMO_CALENDAR_URL` | Live Delmar demo (default `https://myswimday.com/DelmarDolphins?week=2026-07-19`) |
| `SENDER_NAME` | Sign-off name |
| `SENDER_CONTEXT` | One peer line for touch 1 (e.g. Delmar parent of four) |
| `OLLAMA_MODEL` | Local model for score + drafts |
| `HOST` / `PORT` | UI bind (default `0.0.0.0:3847`) |

## Pipeline

| Section | Purpose |
|---------|---------|
| **1 · Discover** | USA Swimming full import and/or manual add / seed CSV (side by side). |
| **2 · Process** | Queue or one lead: fingerprint → enrich → score → **researched**. Separate **Generate drafts** (bulk) with its own batch size. Stop buttons cancel after the current step / Ollama call. |
| **3 · Leads** | Filter/sort, open detail, edit HTML drafts with live preview, Mail.app, status, export CSV. |

```text
Discover: usas | manual | seed CSV
                ↓
Process:  fingerprint → enrich → score  (or disqualified / identified)
                ↓
Draft:    researched → HTML touches 1→2→3 → drafted
Leads:    edit HTML + preview → Mail.app → contacted → export
```

Fingerprint is what filters for **Commit** users among USA Swimming clubs.

### Status meaning

| Status | Meaning |
|--------|---------|
| `new` | Imported / added; not fingerprinted yet. |
| `identified` | Commit ID found; not enriched yet. |
| `disqualified` | No Commit footprint (or similar reject). |
| `researched` | Enrich done (contact + Commit ID). Ready for drafts — **not** “email written”. |
| `drafted` | Touches **1, 2, and 3** ready. Ready to send. |
| `contacted` | You sent outreach (usually touch 1). |

### Outreach (HTML)

1. Get leads to **researched** (Run queue / process one).
2. **Generate drafts** (bulk) — uses **Draft batch size** (separate from Process batch size). Each lead gets touches 1→2→3 as **HTML** → **drafted**. Or regenerate one lead / one touch.
3. Open a lead → touch tabs → edit **HTML** on the left; **Preview** updates live on the right → **Save edits** → **Open in Mail**.
4. Mail.app opens an HTML draft (mailto fallback is plain text only). Mark **contacted** when you send.
5. Later: send touch 2 / 3 from the same lead; status can stay `contacted`.

Draft bodies use simple tags (`<p>`, `<br>`, `<a href>`, `<strong>`, `<em>`). Product URLs are forced in as clickable anchors if the model omits them. Plain-text legacy drafts are converted to HTML when loaded / saved / opened in Mail.

Pitch notes baked into prompts: Delmar as the live demo, peer line from `SENDER_CONTEXT` in touch 1, digests as a follow-up angle, no invented contacts or kids’ details.

## Web UI (local)

```bash
npm run ui
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847). Bind defaults to `0.0.0.0`; on start the server prints real LAN IPv4 URLs for a phone on the same Wi‑Fi. Discover and Process can run together; the leads table refreshes during batches.

**Open in Mail** uses macOS Mail.app via `osascript` on the machine running the server (sets HTML content when possible).

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
