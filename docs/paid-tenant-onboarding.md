# Paid tenant go-live checklist

Use this before a team moves from pilot to paid production.

## 1. Confirm Commit prerequisite

- [ ] Team uses Commit Swimming
- [ ] Public schedule / website data is readable
- [ ] `superTeamId` known and stored on the tenant config
- [ ] Sample week in Commit matches what coaches expect

## 2. Terms acceptance

- [ ] Share team-admin billing link: `https://myswimday.com/{slug}?ta=<teamAdminToken>` (token in `api/_lib/tenants.js`)
- [ ] Admin has reviewed [Service description](https://myswimday.com/service) (included / not included, Commit prerequisite)
- [ ] Admin accepts [Terms](https://myswimday.com/terms) (Checkout TOS checkbox and/or email confirmation)
- [ ] Point them at [Support](https://myswimday.com/support) and [Privacy](https://myswimday.com/privacy)

## 3. Pilot setup and QA

- [ ] Add `src/tenants/<Slug>/` (config, groups, practice/meet parsers)
- [ ] Register in `src/tenants/registry.ts` and mirror in `api/_lib/tenants.js`
- [ ] Timezone + digest send hours correct
- [ ] Open `/{slug}` — week/month, groups, meets/events look right vs Commit
- [ ] Optional: confirm a test digest subscriber

## 4. Payment

- [ ] Club opens Billing via their `?ta=` link → **Get payment link**, **or** you create Checkout via `POST /api/billing/checkout` with ops secret (see [billing-runbook.md](./billing-runbook.md))
- [ ] Payment completed in Stripe (`checkout.session.completed` / active subscription)
- [ ] Set on tenant config (frontend + `api/_lib/tenants.js`): `billingStatus: 'active'`, `stripeCustomerId: 'cus_…'` — then redeploy so the Billing panel shows **Subscribed / Manage**
- [ ] Record tenant slug ↔ Stripe customer / subscription id in ops sheet (auto entitlement deferred)

## 5. Share production

- [ ] Send production calendar URL: `https://myswimday.com/{slug}`
- [ ] Explain digest subscribe (double opt-in) and unsubscribe
- [ ] Share support email `sales@mail.myswimday.com` and expected response targets

## 6. After go-live

- [ ] Portal link available if they need to update card or cancel
- [ ] If subscription past-due: remind admin; if unresolved, pause digests manually until paid or cancelled
