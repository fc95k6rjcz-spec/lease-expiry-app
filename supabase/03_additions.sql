-- ============================================================================
-- App additions — run AFTER 01_schema.sql and 02_views.sql.
-- Adds the few extra lease columns the web app reads/writes.
-- Idempotent: safe to run more than once.
-- ============================================================================
alter table leases add column if not exists suite            text;
alter table leases add column if not exists next_review_date date;
alter table leases add column if not exists review_type      text;
