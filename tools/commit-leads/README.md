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
| `contacted_1` | Sent touch 1 (first email). |
| `contacted_2` | Sent touch 2 (follow-up). |
| `contacted_3` | Sent touch 3 (close loop). |

### Outreach (HTML)

1. Get leads to **researched** (Run queue / process one).
2. **Generate drafts** (bulk) — uses **Draft batch size** and the **1 / 2 / 3** checkboxes. **Force regenerate** only hits the **Force statuses** you check (default: **drafted**). Status becomes **drafted** when all three exist (does not overwrite contacted_1/2/3).
3. Open a lead → touch tabs → edit **HTML** on the left; **Preview** updates live on the right → **Save edits** → **Copy draft** (HTML + plain) or **Open in Mail**.
4. Mail.app opens an HTML draft. Pick **From:** `sales@mail.myswimday.com` (see [Send as myswimday.com](#send-as-myswimdaycom)). **Open Mail + contacted** / **Mark contacted** advances `contacted_1` → `contacted_2` → `contacted_3` (from the active touch; never goes backward).
5. Later: send touch 2 / 3 from the same lead; status moves to `contacted_2` / `contacted_3`.

Draft bodies use simple tags (`<p>`, `<br>`, `<a href>`, `<strong>`, `<em>`). Product URLs are forced in as clickable anchors if the model omits them. Plain-text legacy drafts are converted to HTML when loaded / saved / opened in Mail.

Pitch notes baked into prompts: Delmar is the only live demo (prospects have no MySwimDay calendar yet); cite meets as on their Commit calendar; MySwimDay would sync a mobile week view; peer line from `SENDER_CONTEXT` in touch 1; no invented contacts or kids’ details.

## Web UI (local)

```bash
npm run ui
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847). Bind defaults to `0.0.0.0`; on start the server prints real LAN IPv4 URLs for a phone on the same Wi‑Fi. Discover and Process can run together; the leads table refreshes during batches.

**Open in Mail** uses macOS Mail.app via `osascript` on the machine running the server (sets HTML content when possible). The tool does **not** send mail — you send the draft yourself.

## Send as myswimday.com

Outreach From should be **`sales@mail.myswimday.com`**. That address already receives (Resend inbound → Gmail). Apex `sales@myswimday.com` can *send* from a verified Resend domain, but Gmail’s “confirm this address” mail will not arrive unless apex MX/forwarding exists. Digests stay on `schedule@myswimday.com`.

Path: **Mail.app → your Gmail → Resend SMTP → recipient**. Do not add a Google account for username `resend` (Mail will try `resend@gmail.com`; that is not an account).

### Gmail (web) — Send mail as

1. [Resend](https://resend.com/domains): `myswimday.com` verified for sending (same domain as digests). No extra “mailbox” to create.
2. Gmail → Settings → **See all settings** → **Accounts and Import** → **Send mail as** → add `sales@mail.myswimday.com`.
3. SMTP: host `smtp.resend.com`, port `465` (SSL), username `resend`, password = Resend API key. Use **Send through smtp.resend.com**, not “Send through Gmail”.
4. Click the confirmation link in Gmail (it arrives because inbound is on `mail`).

Resend free tier is $0 (3,000 emails/month, 100/day). Sends and inbound share that quota with digests.

### Mail.app (Mac) — From on drafts

1. Mail → **Settings** → **Accounts** → **+** → **Google** → sign in as **your real Gmail** (the one with Send mail as).
2. Same Gmail account → **Email Address** → dropdown **Edit Email Addresses…** (or comma-separate) → add `sales@mail.myswimday.com`.
3. **Composing** → **Send new messages from:** that sales address (fallback if a draft does not set From).
4. Leads UI → **Open in Mail** sets **From:** to `MAIL_FROM` (`sales@mail.myswimday.com` by default). Confirm it before sending. Leave outgoing as Gmail (`smtp.gmail.com`); Gmail relays to Resend. If From stays on your Gmail address, the sales identity is not on that Mail account yet (step 2).

### Tests

- Send to a **Gmail** address first. That confirms From + SMTP.
- `@icloud.com` / `@me.com` often bounce (`554 5.7.1 HM08` local policy) on a new domain. That is Apple rejecting the message, not a Mail.app misconfig. Warm the domain before relying on iCloud inboxes.

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
