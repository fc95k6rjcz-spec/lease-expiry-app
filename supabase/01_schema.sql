-- ============================================================================
-- LEASE EXPIRY DIARY + TENANT CRM + STACK PLAN + SIGNALS
-- Supabase / PostgreSQL schema
-- ----------------------------------------------------------------------------
-- Run this whole file in the Supabase SQL Editor (or via `supabase db push`).
-- It is idempotent-ish: safe enums via DO blocks; tables use IF NOT EXISTS.
-- Adjust RLS policies (bottom of file) to your auth model before going live.
-- ============================================================================

create extension if not exists "pgcrypto";  -- for gen_random_uuid()

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
do $$ begin
  create type building_grade   as enum ('Premium','A','B','C','D','Other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type owner_type       as enum ('Institutional','REIT','Private','Government','Owner-Occupier','Syndicate','Unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Decision-maker buckets. CEO/CFO are primary AU targets; the rest are
  -- common foreign equivalents.
  create type contact_role     as enum ('CEO','CFO','Managing Director','Country Head','President','Vice President','COO','Head of Property','Office Manager','Other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type contact_source   as enum ('LinkedIn','Lusha','ZoomInfo','Apollo','Company Website','Referral','Manual','Other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rent_increase_type as enum ('Fixed %','Fixed $','CPI','CPI + %','Market','None','Other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lease_status     as enum ('Active','Holdover','Expired','Pre-commencement','Terminated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type signal_type      as enum ('Headcount growth','Hiring activity','M&A / takeover','Funding secured','New patent','New contract','Divestment / disposal','Relocation rumour','Other');
exception when duplicate_object then null; end $$;

do $$ begin
  -- What the signal implies for space demand.
  create type signal_direction as enum ('Expansion','Contraction','Neutral');
exception when duplicate_object then null; end $$;

do $$ begin
  create type impact_rating    as enum ('High','Medium','Low');
exception when duplicate_object then null; end $$;

do $$ begin
  create type interaction_type as enum ('Call','Email','Meeting','LinkedIn message','Note','Proposal sent','Inspection');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- updated_at trigger helper
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================================
-- 1. BUILDINGS  (stack plan + building data)
-- ============================================================================
create table if not exists buildings (
  id                      uuid primary key default gen_random_uuid(),
  name                    text,                       -- e.g. "Governor Phillip Tower"
  street_address          text not null,
  suburb                  text,
  state                   text,                       -- NSW, VIC, QLD ...
  postcode                text,
  country                 text default 'Australia',

  total_lettable_area_sqm numeric(12,2),              -- NLA
  num_levels              integer,
  typical_floorplate_sqm  numeric(12,2),
  building_grade          building_grade,
  year_built              integer,
  year_refurbished        integer,

  owner_name              text,
  owner_type              owner_type default 'Unknown',
  property_manager        text,

  cityscope_ref           text,                       -- source key from CityScope
  notes                   text,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);
create index if not exists idx_buildings_suburb on buildings (suburb);

-- ============================================================================
-- 2. TENANTS  (the occupying companies = the accounts in your CRM)
-- ============================================================================
create table if not exists tenants (
  id                      uuid primary key default gen_random_uuid(),
  legal_name              text not null,
  trading_name            text,
  abn                     text,                       -- Australian Business Number
  industry                text,
  website                 text,
  linkedin_url            text,

  is_foreign              boolean default false,      -- HQ outside Australia
  hq_country              text,
  parent_company          text,

  headcount               integer,                    -- latest known
  headcount_source        contact_source,
  headcount_updated_at    date,

  notes                   text,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);
create index if not exists idx_tenants_legal_name on tenants (legal_name);

-- ============================================================================
-- 3. CONTACTS  (decision-makers — the CRM people)
--    Model many per tenant; flag the two primary buyer targets.
-- ============================================================================
create table if not exists contacts (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references tenants(id) on delete cascade,

  full_name               text not null,
  title                   text,                       -- verbatim job title
  role_category           contact_role default 'Other',
  email                   text,
  mobile                  text,
  phone_direct            text,
  linkedin_url            text,

  is_primary              boolean default false,      -- one of your 2 key targets
  source                  contact_source default 'Manual',
  last_verified_at        date,
  notes                   text,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);
create index if not exists idx_contacts_tenant on contacts (tenant_id);
create index if not exists idx_contacts_primary on contacts (tenant_id) where is_primary;

-- ============================================================================
-- 4. LEASES  (the Lease Expiry Diary — one row per tenancy/lease)
-- ============================================================================
create table if not exists leases (
  id                       uuid primary key default gen_random_uuid(),
  building_id              uuid references buildings(id) on delete set null,
  tenant_id                uuid references tenants(id)   on delete set null,

  levels                   text,                      -- "L5", "L5-7", "Ground + L2"
  size_sqm                 numeric(12,2),

  rent_per_annum           numeric(14,2),             -- net face rent p.a.
  rent_per_sqm             numeric(12,2),             -- $/sqm p.a. (derived or entered)
  rent_basis              text default 'Net',         -- Net / Gross
  annual_increase_type     rent_increase_type default 'Fixed %',
  annual_increase_value    numeric(6,2),              -- e.g. 3.50 (%) or 1500 ($)

  has_mid_term_review      boolean default false,     -- mid-lease market rent review
  mid_term_review_date     date,

  commencement_date        date,
  expiry_date              date,
  lease_term_months        integer,                   -- optional; can derive

  has_break_right          boolean default false,     -- right to break
  break_date               date,
  break_notice_months      integer,

  has_renewal_option       boolean default false,     -- option to renew
  option_terms             text,                      -- "1 x 5 years"
  option_notice_months     integer,

  status                   lease_status default 'Active',
  cityscope_ref            text,
  notes                    text,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);
create index if not exists idx_leases_expiry   on leases (expiry_date);
create index if not exists idx_leases_building on leases (building_id);
create index if not exists idx_leases_tenant   on leases (tenant_id);

-- ============================================================================
-- 5. SIGNALS  (expansion / contraction trigger inputs)
-- ============================================================================
create table if not exists signals (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references tenants(id) on delete cascade,

  signal_type             signal_type not null,
  direction               signal_direction default 'Expansion',
  impact                  impact_rating default 'Medium',

  headline                text not null,             -- short description
  detail                  text,
  magnitude               text,                      -- "+18% YoY", "$50M Series B"
  source                  text,                      -- LinkedIn, AFR, Crunchbase...
  source_url              text,
  detected_date           date default current_date,

  created_at              timestamptz default now()
);
create index if not exists idx_signals_tenant on signals (tenant_id);
create index if not exists idx_signals_date   on signals (detected_date);

-- ============================================================================
-- 6. INTERACTIONS  (CRM activity log — calls, emails, meetings)
-- ============================================================================
create table if not exists interactions (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid references tenants(id)  on delete cascade,
  contact_id              uuid references contacts(id) on delete set null,
  lease_id                uuid references leases(id)   on delete set null,

  type                    interaction_type default 'Note',
  occurred_at             timestamptz default now(),
  summary                 text not null,
  next_action             text,
  next_action_date        date,

  created_at              timestamptz default now()
);
create index if not exists idx_interactions_tenant on interactions (tenant_id);
create index if not exists idx_interactions_next   on interactions (next_action_date);

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
drop trigger if exists trg_buildings_updated on buildings;
create trigger trg_buildings_updated before update on buildings
  for each row execute function set_updated_at();

drop trigger if exists trg_tenants_updated on tenants;
create trigger trg_tenants_updated before update on tenants
  for each row execute function set_updated_at();

drop trigger if exists trg_contacts_updated on contacts;
create trigger trg_contacts_updated before update on contacts
  for each row execute function set_updated_at();

drop trigger if exists trg_leases_updated on leases;
create trigger trg_leases_updated before update on leases
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Supabase enables RLS expectations by default. The policies below give any
-- signed-in user full access (fine for a single-team internal tool). Tighten
-- to per-user / per-org ownership if you ever expose this beyond your team.
-- ----------------------------------------------------------------------------
alter table buildings    enable row level security;
alter table tenants      enable row level security;
alter table contacts     enable row level security;
alter table leases       enable row level security;
alter table signals      enable row level security;
alter table interactions enable row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array['buildings','tenants','contacts','leases','signals','interactions']
  loop
    execute format(
      'drop policy if exists %1$s_all on %1$s;
       create policy %1$s_all on %1$s
         for all to authenticated using (true) with check (true);', tbl);
  end loop;
end $$;
