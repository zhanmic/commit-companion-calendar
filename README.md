# My Swim Day

Weekly practice and meet calendars for swim teams (`myswimday.com`), built on Commit Swimming’s public website API.

## Tenants

| Path | Team |
|------|------|
| [`/DelmarDolfins`](/DelmarDolfins) | Delmar Dolfins |
| [`/VortexSwimClub`](/VortexSwimClub) | Vortex Swim Club |

Product home (`/`) lists available teams. Each tenant owns its Commit `superTeamId` and its own practice/meet parsers under `src/tenants/<Slug>/`.

## Features

- Live data from `utility.commitswimming.com`
- Week view (Sunday–Saturday, tenant timezone)
- Shareable week links (`/DelmarDolfins?week=2026-07-19`)
- Filter by tenant-defined groups
- Recurring practices expanded with cancel/override support
- Optional meets & team events toggle
- Per-tenant practice title parsing (field split or keywords)
- Optional daily/weekly schedule email digests (Resend + Upstash Redis)
- Public policy pages: [`/service`](/service), [`/support`](/support), [`/terms`](/terms), [`/privacy`](/privacy)

**Prerequisite:** teams must use [Commit Swimming](https://www.commitswimming.com) with a public schedule. See the [Service description](/service).

## Billing & paid onboarding

Sales-assisted Stripe Checkout (per team). Operator docs:

- [`docs/billing-runbook.md`](docs/billing-runbook.md) — Stripe setup, checkout/portal API, webhook stub
- [`docs/paid-tenant-onboarding.md`](docs/paid-tenant-onboarding.md) — go-live checklist

| Endpoint | Purpose |
|----------|---------|
| `POST /api/billing/checkout` | Create Checkout Session (`Bearer BILLING_ADMIN_SECRET`) |
| `POST /api/billing/portal` | Create Customer Portal session |
| `POST /api/billing/webhook` | Stripe webhook (logs events; entitlement gating deferred) |

## Develop

```bash
npm install
npm run dev
```

Open [http://localhost:5173/DelmarDolfins](http://localhost:5173/DelmarDolfins) for the current week, or [http://localhost:5173/DelmarDolfins?week=2026-07-19](http://localhost:5173/DelmarDolfins?week=2026-07-19) for a specific week. The landing **See a live schedule** button uses that demo week.

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
| `POST /api/send-now` | Email current digest now (active subscribers only) |
| `GET /api/unsubscribe?token=…` | Unsubscribe via email link |
| `POST /api/unsubscribe` | Unsubscribe from the week-view UI (`email` + `tenantSlug`) |
| `GET /api/cron/send-digests` | Cron tick — send digests due in each tenant’s local time |
| `GET /api/cron/send-daily` | Manual — daily digests only (`?force=1` to ignore local hour) |
| `GET /api/cron/send-weekly` | Manual — weekly digests only (`?force=1` to ignore local hour) |
| `POST /api/inbound` | Resend webhook — forward `sales@` mail to Gmail |
| `POST /api/billing/checkout` | Sales Checkout Session (`Bearer BILLING_ADMIN_SECRET`) |
| `POST /api/billing/portal` | Stripe Customer Portal session |
| `POST /api/billing/webhook` | Stripe webhook (logs; entitlement deferred) |
| Commit `website-data-2a` / `2b` | Team config & schedule (per tenant `superTeamId`) |

## Contact inbox (`sales@mail.myswimday.com` → Gmail)

Landing-page Contact / CTA links use `mailto:sales@mail.myswimday.com`. Resend **Receiving** uses the `mail` subdomain MX (apex `@` would conflict with other mail DNS), fires `email.received`, and `/api/inbound` re-sends it to your Gmail.

### One-time setup

1. **Resend domain receiving** — [Domains](https://resend.com/domains) → `myswimday.com` → enable **Receiving** (MX host shown as `mail`).
2. **DNS (Namecheap / Advanced DNS)** — receiving MX on host `mail` (keep `send.mail` for Resend sending; do **not** put inbound MX on `@`):

   | Type | Host | Value | Priority |
   |------|------|-------|----------|
   | MX | `mail` | `inbound-smtp.us-east-1.amazonaws.com` | `10` |
3. **Vercel env** (Production):
   - `RESEND_API_KEY` (full access — needed to read received mail)
   - `RESEND_FROM_EMAIL` (e.g. `My Swim Day <schedule@myswimday.com>`)
   - `RESEND_WEBHOOK_SECRET` (from the webhook below)
   - `CONTACT_FORWARD_TO=zhanmic@gmail.com`
4. **Resend webhook** — [Webhooks](https://resend.com/webhooks) → Add/edit → event `email.received` → URL **must include the secret**:

   `https://myswimday.com/api/inbound?secret=whsec_xxxxxxxx`

   Use the same value as Vercel `RESEND_WEBHOOK_SECRET`. (Query auth is required because Vite’s Node runtime often breaks Svix raw-body verify.)
5. **Test** — email `sales@mail.myswimday.com`; check Resend → Receiving, webhook delivery log (200), then Gmail.

Health check: `GET https://myswimday.com/api/inbound` (shows which env vars are set, no secrets).

By default any address `@mail.myswimday.com` is forwarded. Optional: `CONTACT_INBOUND_ADDRESSES` / `CONTACT_INBOUND_DOMAIN`.

### Send outreach as `sales@mail.myswimday.com`

The leads tool does not send. Configure Gmail **Send mail as** that address via Resend SMTP, then pick it as **From** in Mac Mail. Details: [`tools/commit-leads/README.md`](tools/commit-leads/README.md#send-as-myswimdaycom). Prefer `sales@mail.myswimday.com` over apex `sales@myswimday.com` so replies and Gmail’s confirm mail can be received.

## Email digests

Subscribers pick **daily** or **weekly**, plus tenant-specific group filters (Delmar: Sr / Jr / Jr Prep / DEVO / …). Empty or all groups = full schedule. Meets and team events are optional.

Requires env vars from [`.env.example`](.env.example):

- **Resend** — `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (verified domain)
- **Inbound → Gmail** — `RESEND_WEBHOOK_SECRET`, `CONTACT_FORWARD_TO` (see Contact inbox above)
- **Upstash Redis** — `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- **Cron** — `CRON_SECRET` (Vercel Cron calls `/api/cron/send-digests`)
- **Links** — `APP_BASE_URL` (e.g. `https://myswimday.com`)
- **Stripe (optional until charging)** — `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `BILLING_ADMIN_SECRET` (see billing runbook)

### Digest send times (per tenant timezone)

Vercel **Hobby** only allows cron expressions that run once per day, so `vercel.json` registers **24 daily jobs** (`0 0` … `0 23` UTC), each hitting `/api/cron/send-digests`. That endpoint checks every tenant’s **local** clock and sends when it is **at or past** the send hour (same local day):

| Digest | When (tenant local time) | Delmar (`America/New_York`) |
|--------|--------------------------|-----------------------------|
| Daily | `dailySendHour` (default **7**) and later | from ~7:00am ET |
| Weekly | Sunday at `weeklySendHour` (default **18**) and later | from Sunday ~6:00pm ET |

Already-sent days/weeks are skipped (`lastDailySentOn` / `lastWeeklySentOn`), so later UTC ticks are a safe catch-up if an earlier Hobby cron is late or missed. Confirming a **daily** subscription also sends today’s digest immediately.

## Adding a tenant

1. Add `src/tenants/<Slug>/` with `TenantConfig`, `parsePractice`, and `parseMeet`.
2. Set `defaultTimeZone` (IANA, e.g. `America/Chicago`) so digests land in that team’s morning.
3. Register it in `src/tenants/registry.ts`.
4. Mirror slug/displayName/`defaultTimeZone`/`dailySendHour`/`weeklySendHour` in `api/_lib/tenants.js` for `/api/tenants` + digests.

## Local sales tool (not deployed)

`tools/commit-leads` is a **local-only** lead finder / HTML outreach drafter (SQLite + Ollama + Mac Mail, Discover → Process → Leads). It is not included in the Vercel build. See [`tools/commit-leads/README.md`](tools/commit-leads/README.md).
