-- ============================================================
-- 07_billing.sql — Stripe billing (profiles + trial + sync)
-- Run after the other migrations. Safe to run once.
-- ============================================================

create table if not exists profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text,
  stripe_customer_id     text unique,
  stripe_subscription_id text,
  plan                   text,                              -- 'pro'
  status                 text default 'trialing',           -- trialing|active|past_due|canceled|inactive
  trial_ends_at          timestamptz default now() + interval '14 days',
  current_period_end     timestamptz,
  updated_at             timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update to authenticated using (id = auth.uid());

-- Auto-create a profile (with 14-day trial) whenever a user signs up.
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Grandfather any existing users in as active (so you're never locked out).
insert into profiles (id, email, status, plan)
select id, email, 'active', 'pro' from auth.users
on conflict (id) do update set status = 'active', plan = 'pro';
