# Lease Expiry Diary — full app (Next.js + Supabase)

A live, editable web app: **Dashboard, Lease Diary, Stack Plans, Tenant CRM, Signals, Buildings**, plus **CSV import/export** and **email login**. Reads and writes your Supabase database. Deploys to Vercel.

---

## 1. Database (Supabase)

In your Supabase project → **SQL Editor**, run these in order (they're in `supabase/`):

1. `01_schema.sql` — tables, enums, RLS
2. `02_views.sql` — reporting views
3. `03_additions.sql` — extra lease columns the app uses (`suite`, `next_review_date`, `review_type`)

RLS is set so **any signed-in user** has full access — fine for an internal team tool.

## 2. Environment variables

Copy `.env.local.example` → `.env.local` and fill from Supabase → **Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        # anon public key
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # service role — ONLY for the import script, keep secret
```

## 3. Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

First visit → **Create account** (email + password). Supabase stores the user. By default Supabase requires email confirmation; to skip it for an internal tool, turn off “Confirm email” in Supabase → Authentication → Providers → Email.

## 4. Load the CityScope data (1,000 tenancies)

Two ways:

**A. Bulk script (recommended, loads the included dataset):**
```bash
npm run import            # adds rows
npm run import -- --reset # wipe first, then load
```
This reads `data/cityscope.json` and populates buildings, tenants and leases using your **service role** key.

**B. In-app:** sign in → **Import / Export** → upload a CityScope **CSV** export. It maps the standard columns, creates missing buildings/tenants, then loads the tenancies.

## 5. Deploy to Vercel

```bash
# from this folder
git init && git add -A && git commit -m "Lease Expiry app"
# push to a GitHub repo, then:
```
1. Go to **vercel.com → New Project → import the repo**.
2. Framework preset: **Next.js** (auto-detected). Root directory: this folder.
3. **Environment Variables** → add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the service role key is **not** needed on Vercel — it's only for the local import script).
4. **Deploy.**

CLI alternative: `npm i -g vercel && vercel` then `vercel --prod`. Add the two env vars when prompted (or in the dashboard) and redeploy.

---

## What's in it

| Page | Does |
|------|------|
| **Dashboard** | KPIs, expiries-by-year chart, signal-ranked hot prospects, top buildings. |
| **Lease Diary** | Filter by building / expiry window, search, sort, colour-coded urgency. Add/edit/delete leases. Export CSV. |
| **Stack Plans** | Per-building stack by level, coloured by expiry. Click a unit to edit. |
| **Tenants / CRM** | Accounts with decision-maker contacts (CEO/CFO etc.), signals and tenancies. Full contact CRUD. |
| **Signals** | Expansion triggers per tenant, paired with the tenant's next expiry. |
| **Buildings** | Building cards + full building-data editing. |
| **Import / Export** | CityScope CSV in; lease diary & contacts CSV out. |

## How it fits together

- `lib/supabase.js` — browser client (session in localStorage).
- `lib/auth.js` — email/password auth context + route guard (`components/Shell.js`).
- `lib/data.js` — reads `leases` with embedded `buildings`/`tenants`; computes months-to-expiry and per-building/per-tenant rollups client-side.
- `components/forms.js` — modal create/edit forms writing straight to the base tables.
- Reads use base tables (and the SQL views for CSV export); writes target base tables.

## Notes & next steps

- **Contacts** (CEO/CFO) start empty by design — that's the LinkedIn/Lusha enrichment step. Add them per tenant in CRM.
- **Signals** can be appended manually now; a scheduled job can later scan tenants for headcount/hiring/M&A/funding and insert them automatically.
- To lock down access further, tighten the RLS policies in `01_schema.sql` from “any authenticated user” to per-org ownership.
