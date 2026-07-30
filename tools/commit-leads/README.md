# Commit Leads

Local CLI + web UI to find swim teams using [Commit Swimming](https://www.commitswimming.com), capture published office contacts, score fit with Ollama, and export a sales CSV.

Isolated from the Vercel calendar app — nothing under root `api/` is deployed from this folder.

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
| **2 · Process** | **Process pending** runs fingerprint → enrich → score. Separate step buttons are optional for re-runs. |
| **3 · Leads** | Browse/update the list (refreshes during batches) and export CSV. |

USA Swimming’s Find a Team API returns the **full national directory in one download** (~4MB, cached 24h). Re-running Discover only adds new clubs (unless Force re-import).

```text
Discover: usas | manual | seed CSV
                ↓
Process:  process pending → fingerprint → enrich → score
                ↓
Leads:    table (live refresh) → export / download CSV
```

Fingerprint is what filters for **Commit** users among USA Swimming clubs. Single-step Fingerprint / Enrich / Score buttons remain for targeted re-runs (e.g. re-score after changing the model).

## Web UI

```bash
npm run ui
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847). Discover and Process can run together; the leads table updates as batches finish.
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
