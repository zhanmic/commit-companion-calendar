# My Swim Day

Weekly practice and meet calendars for swim teams (`myswimday.com`), built on Commit Swimming’s public website API.

## Tenants

| Path | Team |
|------|------|
| [`/DelmarDolphins`](/DelmarDolphins) | Delmar Dolphins |

Product home (`/`) lists available teams. Each tenant owns its Commit `superTeamId` and its own practice/meet parsers under `src/tenants/<Slug>/`.

## Features

- Live data from `utility.commitswimming.com`
- Week view (Sunday–Saturday, tenant timezone)
- Filter by tenant-defined groups
- Recurring practices expanded with cancel/override support
- Optional meets & team events toggle
- Per-tenant practice title parsing (field split or keywords)
- Optional daily/weekly schedule email digests (Resend + Upstash Redis)

## Develop

```bash
npm install
npm run dev
```

Open [http://localhost:5173/DelmarDolphins](http://localhost:5173/DelmarDolphins).

## Build

```bash
npm run build
npm run preview
```

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/tenants` | Public tenant catalog |
| `GET /api/calendar?d=…` | Inline `.ics` for iOS Add to Calendar |
| `POST /api/subscribe` | Start / update email subscription (double opt-in) |
| `GET /api/confirm?token=…` | Confirm subscription |
| `GET /api/unsubscribe?token=…` | Unsubscribe via email link |
| `POST /api/unsubscribe` | Unsubscribe from the week-view UI (`email` + `tenantSlug`) |
| `GET /api/cron/send-daily` | Cron — send daily digests |
| `GET /api/cron/send-weekly` | Cron — send weekly digests (Sundays) |
| `POST /api/inbound` | Resend webhook — forward `sales@` mail to Gmail |
| Commit `website-data-2a` / `2b` | Team config & schedule (per tenant `superTeamId`) |

## Contact inbox (`sales@myswimday.com` → Gmail)

Landing-page Contact / CTA links use `mailto:sales@myswimday.com`. Resend **Receiving** accepts that mail (MX), fires `email.received`, and `/api/inbound` re-sends it to your Gmail.

### One-time setup

1. **Resend domain receiving** — [Domains](https://resend.com/domains) → `myswimday.com` → enable **Receiving**.
2. **DNS (Namecheap / registrar)** — add Resend’s receiving MX on the root (no other MX today, so apex is fine):

   | Type | Host | Value | Priority |
   |------|------|-------|----------|
   | MX | `@` | `inbound-smtp.us-east-1.amazonaws.com` | `10` |
3. **Vercel env** (Production):
   - `RESEND_API_KEY` (full access — needed to read received mail)
   - `RESEND_FROM_EMAIL` (e.g. `My Swim Day <schedule@myswimday.com>`)
   - `RESEND_WEBHOOK_SECRET` (from the webhook below)
   - `CONTACT_FORWARD_TO=zhanmic@gmail.com`
4. **Resend webhook** — [Webhooks](https://resend.com/webhooks) → Add → URL `https://myswimday.com/api/inbound` → event `email.received` → copy signing secret into `RESEND_WEBHOOK_SECRET`.
5. **Test** — email `sales@myswimday.com` from another account; check Resend → Emails → Receiving, then your Gmail. Reply from Gmail uses Reply-To (original sender).

Optional: `CONTACT_INBOUND_ADDRESSES` (comma-separated) to allow more than `sales@myswimday.com`.

## Email digests

Subscribers pick **daily** or **weekly**, plus tenant-specific group filters (Delmar: Sr / Jr / Jr Prep / DEVO / …). Empty or all groups = full schedule. Meets and team events are optional.

Requires env vars from [`.env.example`](.env.example):

- **Resend** — `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (verified domain)
- **Inbound → Gmail** — `RESEND_WEBHOOK_SECRET`, `CONTACT_FORWARD_TO` (see Contact inbox above)
- **Upstash Redis** — `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- **Cron** — `CRON_SECRET` (Vercel Cron calls `/api/cron/send-daily` and `/api/cron/send-weekly`)
- **Links** — `APP_BASE_URL` (e.g. `https://myswimday.com`)

Send windows (UTC crons chosen for Eastern):

| Digest | Path | Schedule | Approx. local (ET) |
|--------|------|----------|--------------------|
| Daily | `/api/cron/send-daily` | `0 11 * * *` | ~7:00am |
| Weekly | `/api/cron/send-weekly` | `0 22 * * 0` | Sunday ~6:00pm |

## Adding a tenant

1. Add `src/tenants/<Slug>/` with `TenantConfig`, `parsePractice`, and `parseMeet`.
2. Register it in `src/tenants/registry.ts`.
3. Mirror slug/displayName in `api/_lib/tenants.js` for `/api/tenants`.

## Local sales tool (not deployed)

`tools/commit-leads` is a **local-only** lead finder / outreach drafter (SQLite + Ollama + Mac Mail). It is not included in the Vercel build. See [`tools/commit-leads/README.md`](tools/commit-leads/README.md).
