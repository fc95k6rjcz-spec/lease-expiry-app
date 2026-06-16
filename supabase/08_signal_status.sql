-- ============================================================
-- 08_signal_status.sql — lets you dismiss / mark-actioned signals.
-- (Already applied to the live database; kept here for the record.)
-- ============================================================
alter table signals add column if not exists status text not null default 'active';
-- status: 'active' | 'actioned' | 'dismissed'
