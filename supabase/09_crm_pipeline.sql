-- ============================================================
-- 09_crm_pipeline.sql — turn tenants into a CRM pipeline.
-- (Already applied to the live database; kept here for the record.)
-- relationship: 'Prospect' | 'Client' | 'Competitor' | 'Lost' | null (untracked)
-- pipeline:     jsonb map of completed steps -> date, e.g. {"Email":"2026-06-17"}
-- notes already exists on tenants.
-- ============================================================
alter table tenants add column if not exists relationship text;
alter table tenants add column if not exists pipeline jsonb not null default '{}'::jsonb;
