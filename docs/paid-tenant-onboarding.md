# Paid tenant go-live checklist

Use this before a team moves from pilot to paid production.

## 1. Confirm Commit prerequisite

- [ ] Team uses Commit Swimming
- [ ] Public schedule / website data is readable
- [ ] `superTeamId` known and stored on the tenant config
- [ ] Sample week in Commit matches what coaches expect

## 2. Terms acceptance

- [ ] Set team password in Vercel `TEAM_ADMIN_TOKENS` (or `TEAM_ADMIN_TOKEN_<SLUG>`)
- [ ] Share team-admin access: Settings → Team password, or `https://myswimday.com/{shortSlug}?ta=<password>`
- [ ] Admin has reviewed [Service description](https://myswimday.com/service) (included / not included, Commit prerequisite)
- [ ] Admin accepts [Terms](https://myswimday.com/terms) (Checkout TOS checkbox and/or email confirmation)
- [ ] Point them at [Support](https://myswimday.com/support) and [Privacy](https://myswimday.com/privacy)

## 3. Pilot setup and QA

- [ ] Add `src/tenants/<Slug>/` (config, groups, practice/meet parsers)
- [ ] Assign next unused `shortSlug` (`1` Delmar, `2` Vortex, then `3`…)
- [ ] Register in `src/tenants/registry.ts` and mirror in `api/_lib/tenants.js`
- [ ] Timezone + digest send hours correct
- [ ] Open `/{shortSlug}` — week/month, groups, meets/events look right vs Commit
- [ ] Optional: confirm a test digest subscriber

## 4. Payment

Roster = swimmer count, not digest subscribers. Plans (not in checkout yet): **Club** $15/mo or $165/yr (&lt;150), **Club Plus** $29/mo or $319/yr (150–999), **Program** $49/mo or $539/yr (1,000+). Yearly is 11 months’ price (one month free). Stripe Dashboard steps: [stripe-config.md](./stripe-config.md). Checkout API: [billing-runbook.md](./billing-runbook.md#plans-offer--not-wired-in-checkout-yet).

- [ ] Confirm roster and which plan applies
- [ ] **Club:** team opens Settings → **Team** (or `?ta=` link) → **Get payment link**, **or** you `POST /api/billing/checkout` (uses `STRIPE_PRICE_ID` = $15)
- [ ] **Club Plus / Program:** do **not** use in-app Get payment link until multi-price exists. Create a Stripe Payment Link on the $29 or $49 Price and send it
- [ ] Payment completed in Stripe (`checkout.session.completed` / active subscription)
- [ ] Set on tenant config (frontend + `api/_lib/tenants.js`): `billingStatus: 'active'`, `stripeCustomerId: 'cus_…'` — then redeploy so Settings → Team shows **Subscribed / Manage**
- [ ] Record tenant slug ↔ plan ↔ Stripe customer / subscription id in ops sheet (auto entitlement deferred)

## 5. Share production

- [ ] Send production calendar URL: `https://myswimday.com/{shortSlug}`
- [ ] Explain digest subscribe (double opt-in) and unsubscribe
- [ ] Share support email `sales@mail.myswimday.com` and expected response targets

## 6. After go-live

- [ ] Portal link available if they need to update card or cancel
- [ ] If subscription past-due: remind admin; if unresolved, pause digests manually until paid or cancelled
