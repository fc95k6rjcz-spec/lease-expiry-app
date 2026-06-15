-- ============================================================================
-- HELPER VIEWS
-- Run after 01_schema.sql. These are the day-to-day "screens" you'll query.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- v_lease_diary : the Lease Expiry Diary, one row per lease, flattened.
-- ----------------------------------------------------------------------------
create or replace view v_lease_diary as
select
  l.id                                   as lease_id,
  b.name                                 as building,
  b.street_address,
  b.suburb,
  t.legal_name                           as tenant,
  l.levels,
  l.size_sqm,
  l.rent_per_annum,
  l.rent_per_sqm,
  l.annual_increase_type,
  l.annual_increase_value,
  l.has_mid_term_review,
  l.mid_term_review_date,
  l.commencement_date,
  l.expiry_date,
  (l.expiry_date - current_date)                          as days_to_expiry,
  round((l.expiry_date - current_date) / 30.44, 1)        as months_to_expiry,
  l.has_break_right,
  l.break_date,
  l.has_renewal_option,
  l.option_terms,
  l.status
from leases l
left join buildings b on b.id = l.building_id
left join tenants   t on t.id = l.tenant_id
order by l.expiry_date nulls last;

-- ----------------------------------------------------------------------------
-- v_upcoming_expiries : leases expiring within the next 24 months (active).
-- ----------------------------------------------------------------------------
create or replace view v_upcoming_expiries as
select *
from v_lease_diary
where status in ('Active','Holdover')
  and expiry_date is not null
  and expiry_date <= current_date + interval '24 months'
order by expiry_date;

-- ----------------------------------------------------------------------------
-- v_stack_plan : per-building stack — who is on each level, sqm, expiry.
-- Order levels then expiry. Pair this with the building header data below.
-- ----------------------------------------------------------------------------
create or replace view v_stack_plan as
select
  b.id                          as building_id,
  b.name                        as building,
  b.street_address,
  b.total_lettable_area_sqm,
  b.num_levels,
  l.levels,
  t.legal_name                  as tenant,
  l.size_sqm,
  l.expiry_date,
  round((l.expiry_date - current_date) / 30.44, 1) as months_to_expiry,
  l.status
from buildings b
left join leases  l on l.building_id = b.id
left join tenants t on t.id = l.tenant_id
order by b.name, l.levels;

-- ----------------------------------------------------------------------------
-- v_hot_prospects : the money view.
-- Tenants with a lease expiring in the next 24 months AND an expansion
-- signal in the last 12 months — ranked best targets to call.
-- ----------------------------------------------------------------------------
create or replace view v_hot_prospects as
select
  t.id                          as tenant_id,
  t.legal_name                  as tenant,
  b.name                        as building,
  l.levels,
  l.size_sqm,
  l.expiry_date,
  round((l.expiry_date - current_date) / 30.44, 1) as months_to_expiry,
  count(s.id) filter (where s.direction = 'Expansion')               as expansion_signals,
  max(s.detected_date)                                               as latest_signal_date,
  string_agg(distinct s.signal_type::text, ', ')                     as signal_types,
  -- primary contacts rolled up for quick dialling
  string_agg(distinct c.full_name || ' (' || coalesce(c.role_category::text,'') || ')', '; ')
    filter (where c.is_primary)                                      as primary_contacts
from leases l
join tenants  t on t.id = l.tenant_id
left join buildings b on b.id = l.building_id
left join signals  s on s.tenant_id = t.id
     and s.detected_date >= current_date - interval '12 months'
left join contacts c on c.tenant_id = t.id
where l.status in ('Active','Holdover')
  and l.expiry_date is not null
  and l.expiry_date <= current_date + interval '24 months'
group by t.id, t.legal_name, b.name, l.levels, l.size_sqm, l.expiry_date
order by expansion_signals desc nulls last, l.expiry_date;

-- ----------------------------------------------------------------------------
-- v_follow_ups : open CRM next-actions, soonest first.
-- ----------------------------------------------------------------------------
create or replace view v_follow_ups as
select
  i.next_action_date,
  t.legal_name        as tenant,
  c.full_name         as contact,
  i.type,
  i.summary,
  i.next_action
from interactions i
left join tenants  t on t.id = i.tenant_id
left join contacts c on c.id = i.contact_id
where i.next_action_date is not null
  and i.next_action_date >= current_date
order by i.next_action_date;
