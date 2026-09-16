# Stripe config guide

Sales-assisted billing for My Swim Day. Public prices live on [`/service`](https://myswimday.com/service) and [`/terms`](https://myswimday.com/terms). The app checkout still uses **one** Club monthly Price. You do **not** need every Price live on day one.

Checkout / portal API details: [billing-runbook.md](./billing-runbook.md). Go-live checklist: [paid-tenant-onboarding.md](./paid-tenant-onboarding.md).

## What the app actually reads

| Env | Required to charge via the site | What it is |
|-----|--------------------------------|------------|
| `STRIPE_SECRET_KEY` | Yes | `sk_test_…` or `sk_live_…` |
| `STRIPE_PRICE_ID` | Yes | Recurring **Club $15 / month** (`price_…`) |
| `STRIPE_PRICE_ID_ANNUAL` | No | Recurring **Club $165 / year** if you want `interval: "year"` on checkout |
| `STRIPE_WEBHOOK_SECRET` | Yes for signed webhooks | `whsec_…` from the webhook endpoint |
| `STRIPE_CHECKOUT_REQUIRE_TOS` | After TOS URL is set | Set to `1` |
| `BILLING_ADMIN_SECRET` | For curl checkout/portal | Long random string |
| `BILLING_UI_SECRET` | Optional | Can match admin secret |
| `TEAM_ADMIN_TOKENS` | For Settings → Get payment link | JSON map of slug → password |

Club Plus / Program Prices are **Dashboard only** until multi-price checkout exists. Do not put those ids in `STRIPE_PRICE_ID` or every in-app checkout will charge the higher amount.

## Test vs live

Work in **Test mode** until a real club pays. Toggle Test/Live in the [Dashboard](https://dashboard.stripe.com). Keys and Price ids are different in each mode.

- Local `.env` (gitignored): use `sk_test_…` and test `price_…` ids.
- Vercel Production: use `sk_live_…` and live `price_…` ids when you are ready to take cards.

Cursor can list your Prices (amounts only) if `STRIPE_SECRET_KEY` is in **local** `.env`. Vercel env is not visible from the laptop.

## Products and Prices (match legal copy)

Same product features on every tier. Roster = swimmer count. Yearly is **11 months’ price** (one month free): set the yearly amount yourself (Stripe will not compute “11×” from monthly).

| Product name (suggested) | Roster | Monthly Price | Yearly Price |
|--------------------------|--------|---------------|--------------|
| My Swim Day — Club | Under 150 | $15 / month | $165 / year |
| My Swim Day — Club Plus | 150–999 | $29 / month | $319 / year |
| My Swim Day — Program | 1,000+ | $49 / month | $539 / year |

### Create a Product + Prices

1. [Products](https://dashboard.stripe.com/products) → **Add product**.
2. Name e.g. `My Swim Day — Club`. Description can be “Hosted calendar + email digests, under 150 swimmers.”
3. **Pricing**: Recurring, USD, **$15**, Billing period **Monthly**. Save. Copy the Price id (`price_…`) → `STRIPE_PRICE_ID`.
4. On the same product: **Add another price** → Recurring, USD, **$165**, Billing period **Yearly**. Copy that id → `STRIPE_PRICE_ID_ANNUAL` (optional).
5. Repeat Plus / Program **when that roster is ready to pay**, not before. Leave them unused in env.

If you already created a yearly Price: open the product → Prices → check the **unit amount**. If it is not $165 / $319 / $539, either archive it and add a new Price (old subscriptions keep the old Price) or change legal copy to match Dashboard. Do not rely on a coupon for the published yearly rate; publish the Price amount.

### Payment Links (Plus / Program, or yearly without env)

[Payment Links](https://dashboard.stripe.com/payment-links) → create link → pick the Plus or Program Price. Add metadata `tenantSlug` = the tenant slug. Email that URL. Club can use in-app checkout **or** a Payment Link on the $15 Price.

## Customer Portal and Checkout TOS

1. Settings → Billing → [Customer portal](https://dashboard.stripe.com/settings/billing/portal): allow customers to **cancel** and **update payment method**.
2. Settings → [Checkout](https://dashboard.stripe.com/settings/checkout) / Public details: Terms of Service URL `https://myswimday.com/terms`.
3. Then set Vercel `STRIPE_CHECKOUT_REQUIRE_TOS=1` so Checkout shows the TOS checkbox.

## Webhook

1. Developers → [Webhooks](https://dashboard.stripe.com/webhooks) → Add endpoint  
   `https://myswimday.com/api/billing/webhook`
2. Events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
3. Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`.
4. Use a **live** endpoint with live keys, **test** endpoint with test keys (or one endpoint per mode).

Today the handler **verifies and logs**. It does not flip `billingStatus` on the tenant. After a paid Checkout, you still set `billingStatus: 'active'` and `stripeCustomerId` in code and redeploy. Keep a sheet: slug, plan, `cus_`, `sub_`.

## Put secrets in Vercel (Production)

Project → Settings → Environment Variables (Production):

```
STRIPE_SECRET_KEY=sk_live_…
STRIPE_PRICE_ID=price_…          # Club $15/month only
STRIPE_PRICE_ID_ANNUAL=price_…   # optional Club $165/year
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_CHECKOUT_REQUIRE_TOS=1
BILLING_ADMIN_SECRET=            # openssl rand -hex 24
BILLING_UI_SECRET=               # can match admin
TEAM_ADMIN_TOKENS={"DelmarDolfins":"…","VortexSwimClub":"…"}
```

Redeploy after changing env. Confirm (no secrets in the JSON):

- `GET https://myswimday.com/api/billing/checkout`
- `GET https://myswimday.com/api/billing/webhook`

## Local `.env` (optional, for you / Cursor)

Copy [`.env.example`](../.env.example) to a gitignored `.env` at the **repo root** (not `tools/commit-leads/.env`). Each Stripe variable has a Dashboard URL in that file. Use **test** keys. Never commit `.env`. With `STRIPE_SECRET_KEY` present locally, an agent can list Prices (amount + interval) without opening the Dashboard.

## Smoke test (test mode)

1. `STRIPE_SECRET_KEY` + Club `STRIPE_PRICE_ID` set locally or on a Preview deploy.
2. Unlock Settings → Team with `TEAM_ADMIN_TOKENS` → **Get payment link**, or curl checkout with `interval: "month"`.
3. Pay with Stripe test card `4242 4242 4242 4242`.
4. Dashboard → Payments / Subscriptions shows the test charge.
5. Webhook deliveries show `2xx`. Copy `cus_…` onto the tenant when you are doing a real go-live.

## What not to do yet

- Plan picker on the landing page or Checkout (still one `STRIPE_PRICE_ID`).
- Extra env vars like `STRIPE_PRICE_ID_PLUS`.
- Pointing `STRIPE_PRICE_ID` at $29 or $49.
- Expecting webhooks to activate the tenant automatically.
