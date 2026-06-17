# Black Rain — roadmap & build ledger

The information-advantage CRE prospecting engine. This file tracks every request and idea, what's built, and what's left.

## ✅ Built & live
- Lease Expiry Diary — all fields (address, levels, sqm, rent, increase, mid-term review, commencement, expiry, break, option), 1,000 CityScope tenancies loaded.
- Tenant CRM — researched CEO/CFO/MD names + titles, contact LinkedIn links, notes.
- Pipeline — tags (Prospect/Client/Competitor/Lost), tickable stages (Email→…→Contract), Won/Lost, board view.
- Signals — expansion/contraction triggers, weekly auto-scan writing to the DB, dismiss/action/follow-up.
- Reasons to Call — lease-event triggers (holdover, option due, reviews, break) + copy-ready openers.
- Targets — Consolidation (fragmented non-contiguous suites; multi-site occupiers) with operator filter.
- Stack Plans — searchable, sorted; building data.
- Dashboard — KPIs, expiry chart, hot prospects, My-Clients critical dates, follow-ups.
- Data — dedupe/merge, title-casing, off-market columns.
- Brand — Black Rain dark theme + logo. Deployed on Vercel + Supabase. Stripe removed (single client).

## 🔨 Now building (tranche 1 — pure data, no external keys)
- **Opportunity Score** — one 0–100 number ranking the whole market (timing × size × signal × holdover × option × fragmentation × above-market × contactability), with a "why".
- **Market-rent benchmarking** — per-building $/sqm medians; flag tenants above/below market.
- **Two-sided matchmaking** — space likely coming available ↔ tenants who need space.

## 🟡 Next (pure data, no keys — sequence after tranche 1)
- **Analytics / run-it-like-a-business** — win/loss, conversion by trigger type, commission-weighted pipeline forecast.
- **Deal-economics calculator** — current occupancy cost vs consolidation/relocation scenario → $ saving in the opener.
- **Representation intel** — track incumbent agent / "appointed competitor", time approaches for when mandates lapse.
- **Sparse stack plans** — render "vacant / unlisted" floors so partial buildings read complete.
- **Report exports** — one-click tenancy schedule / occupancy summary.

## 🔌 Needs infrastructure (scope + a key/service — deliberate, not half-built)
- **Bespoke AI openers + person enrichment** — small server route + LLM key; replaces the deterministic openers with fully tailored ones (person's name, background, your voice) and a feedback loop that learns your taste.
- **Directory-board OCR (in-app, phone)** — vision API on a photo-upload endpoint. *Interim: send the photo in chat and it gets extracted + loaded as off-market.*
- **Alerts / notifications** — email/push reminders for critical dates & new high-score leads (email provider + scheduled job).
- **Document repository** — store the lease PDF per tenancy (Supabase Storage; buildable, moderate).
- **Lusha/Apollo enrichment** — auto-fill blank contact emails/mobiles (paid API key).
- **Precinct map / heat-map** — geocode addresses (geocoding API) → CBD heat-map of expiries, growth, vacancies, clients.
- **Field / on-site mode** — phone-first view: snap a board → see who's expiring in *this* building while in the lobby.

## Big-picture vision
Move from "here's a list" → **deal-origination engine**: who to call, why now, what to say, what the deal is worth, and where to put them (matchmaking). Black Rain's moat = proprietary off-market data (directory boards) + logic competitors can't buy from a data vendor.
