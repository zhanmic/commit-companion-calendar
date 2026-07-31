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
| Commit `website-data-2a` / `2b` | Team config & schedule (per tenant `superTeamId`) |

## Adding a tenant

1. Add `src/tenants/<Slug>/` with `TenantConfig`, `parsePractice`, and `parseMeet`.
2. Register it in `src/tenants/registry.ts`.
3. Mirror slug/displayName in `api/_lib/tenants.js` for `/api/tenants`.
