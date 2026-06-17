-- ============================================================
-- 10_off_market.sql — support proprietary "off-market" tenants
-- captured from lobby directory boards (not in CityScope).
-- (Already applied to the live database; kept here for the record.)
-- ============================================================
alter table tenants add column if not exists off_market boolean not null default false;
alter table tenants add column if not exists source text;  -- 'CityScope' | 'Directory board' | 'Manual'
update tenants set source = 'CityScope' where source is null;
