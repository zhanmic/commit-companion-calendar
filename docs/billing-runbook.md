# Billing runbook (Stripe)

Sales-assisted subscriptions for My Swim Day. Customers do **not** self-serve signup yet. You create a Checkout Session (or Dashboard Payment Link), send the URL, and track status in Stripe until tenant `billingStatus` exists.

## One-time Stripe setup

1. Create a **Product** in Stripe (e.g. “My Swim Day — Team”).
2. Add a **recurring Price** (monthly per team). Optional: a yearly price.
3. **Customer Portal** — Settings → Billing → Customer portal: allow cancel + update payment method.
4. **Checkout Terms** — Settings → Checkout / Public details: set Terms of Service URL to `https://myswimday.com/terms`. Then set Vercel `STRIPE_CHECKOUT_REQUIRE_TOS=1` so Checkout requires the TOS checkbox.
5. **Webhook** — endpoint `https://myswimday.com/api/billing/webhook`, events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
6. Copy secrets into Vercel (Production):

| Env | Purpose |
|-----|---------|
| `STRIPE_SECRET_KEY` | Secret key (`sk_…`) |
| `STRIPE_PRICE_ID` | Monthly price id (`price_…`) |
| `STRIPE_PRICE_ID_ANNUAL` | Optional yearly price id |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (`whsec_…`) |
| `BILLING_ADMIN_SECRET` | Shared secret for creating Checkout / Portal sessions (curl) |
| `BILLING_UI_SECRET` | Secret for admin Billing panel (`?admin=1`); may match admin secret |
| `STRIPE_CHECKOUT_REQUIRE_TOS` | Set to `1` after Dashboard TOS URL is configured |

## Roles

| Role | Unlock | Sees |
|------|--------|------|
| **Operator** (you) | `?admin=1` | Advanced schedule Settings (Commit toggles, etc.) — **not** Billing |
| **Team admin** (club) | `?ta=<token>` on that tenant URL | Billing panel (pay / manage) |
| Parent / coach | normal link | Calendar + email subscribe only |

Team admin tokens live **only** in [`api/_lib/tenants.js`](../api/_lib/tenants.js) (`teamAdminToken`). They are not in the frontend bundle. Share a private link like:

`https://myswimday.com/DelmarDolfins?ta=<token>`

After unlock, `?ta=` is stripped and the session stays in that browser until they tap **Sign out** or open `?ta=0`.

## Admin Billing UI (team admin)

1. Send the club their `?ta=` link.
2. They open **Billing** (card icon) next to Settings.
3. **Not subscribed** → **Get payment link** (Stripe Checkout).
4. After they pay: you set `billingStatus: 'active'` and `stripeCustomerId: 'cus_…'` on the tenant (frontend + server registry), redeploy.
5. **Subscribed** → **Manage billing** (Customer Portal).

Ops can still create Checkout via curl with `BILLING_ADMIN_SECRET` (see below).

Health: `GET /api/billing/checkout` and `GET /api/billing/webhook` report which env vars are set (no secrets).

## Create a Checkout link (API)

After the tenant is registered in code (Commit `superTeamId` present):

```bash
curl -sS -X POST https://myswimday.com/api/billing/checkout \
  -H "Authorization: Bearer $BILLING_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantSlug": "ExampleSwimClub",
    "customerEmail": "admin@example.com",
    "interval": "month"
  }'
```

Response includes `url` — email that link to the team admin. Checkout requires accepting Terms (Dashboard TOS URL must be set).

Optional body fields: `interval` (`month` \| `year`), `successUrl`, `cancelUrl`.

### Dashboard Payment Link (alternative)

Create a Payment Link on the same Price in Stripe Dashboard. Put `tenantSlug` in the payment link metadata if you use links often, and still record the customer ↔ tenant mapping in your ops sheet.

## Customer Portal (update card / cancel)

```bash
curl -sS -X POST https://myswimday.com/api/billing/portal \
  -H "Authorization: Bearer $BILLING_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"cus_xxx"}'
```

Send the returned `url` to the admin.

## Webhook stub behavior

`/api/billing/webhook` verifies the Stripe signature when possible and **logs** subscription events (`tenantSlug`, customer, status). It does **not** yet write `billingStatus` onto tenants or soft-gate digests.

**Until entitlement lands:** treat Stripe Dashboard + a simple spreadsheet as source of truth (tenant slug ↔ `cus_` / `sub_` / status). Past-due → contact the club; suspend digests manually if needed.

## Deferred: entitlement gating

Do **not** implement yet (by design for first paid conversions):

- Persist `billingStatus` / `stripeCustomerId` on tenant records
- Soft-gate digests or show “subscription inactive” on the calendar

See [paid-tenant-onboarding.md](./paid-tenant-onboarding.md) for the go-live checklist.
