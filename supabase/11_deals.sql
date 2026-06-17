-- ============================================================
-- 11_deals.sql — Deal Evidence (comparable transactions).
-- Net effective rent is computed in the app: face × (1 − incentive%).
-- (Already applied to the live database; kept here for the record.)
-- ============================================================
create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references buildings(id) on delete set null,
  building_name text,
  address text,
  suburb text,
  grade text,                          -- Premium | A | B | C
  tenant text,
  landlord text,
  floor text,
  area_sqm numeric(12,2),
  deal_date date,
  lease_term_years numeric(5,1),
  face_rent_sqm numeric(12,2),         -- net face $/m² p.a.
  incentive_pct numeric(5,2),          -- % incentive
  rent_basis text default 'Net',       -- Net | Gross
  review_type text, review_value numeric(6,2),
  source text,                         -- own deal | broker | valuer | illustrative
  confidence text default 'Reported',  -- Verified | Reported | Rumoured
  notes text,
  created_at timestamptz default now()
);
alter table deals enable row level security;
drop policy if exists deals_all on deals;
create policy deals_all on deals for all to authenticated using (true) with check (true);
