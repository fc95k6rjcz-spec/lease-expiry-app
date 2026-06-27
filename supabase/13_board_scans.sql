-- 13_board_scans.sql — vacancy time-machine.
-- Every lobby-board scan is stored as a timestamped snapshot of who was in the
-- building. Re-scanning over time builds a longitudinal occupancy record:
-- churn per building, predicted upcoming vacancies, and data freshness — a
-- proprietary time-series no data vendor can sell. (Applied via MCP; kept here
-- so the schema lives in the repo.)

create table if not exists board_scans (
  id             uuid primary key default gen_random_uuid(),
  building_id    uuid references buildings(id) on delete cascade,
  building_name  text,
  scanned_at     timestamptz default now(),
  scanned_by     text,
  occupier_count int,
  roster         jsonb,            -- [{tenant, floor}] read off the board
  new_count      int default 0,    -- vs the previous scan (off-market finds)
  gone_count     int default 0,    -- departed since last scan (space freeing up)
  moved_count    int default 0,
  image_url      text,
  created_at     timestamptz default now()
);

create index if not exists board_scans_building_idx on board_scans (building_id, scanned_at desc);

alter table board_scans enable row level security;
drop policy if exists board_scans_all on board_scans;
create policy board_scans_all on board_scans
  for all to authenticated using (true) with check (true);
