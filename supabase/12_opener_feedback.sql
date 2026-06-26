-- 12_opener_feedback.sql — learning loop for AI outreach openers.
-- Every time Rowan copies or edits an opener, we store both the generated text
-- and his final version. Recent finals are fed back to the model as voice
-- examples so tailored openers increasingly sound like him and reflect what he
-- actually sends. Run after the earlier numbered files.

create table if not exists opener_feedback (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete set null,
  signal_type   text,                 -- the trigger this opener was for
  generated     text,                 -- what LEX produced (template or AI)
  final         text,                 -- what Rowan actually used after edits
  action        text,                 -- 'copied' | 'edited' | 'tailored'
  edited        boolean default false,-- did final differ from generated?
  created_by    text,                 -- user email
  created_at    timestamptz default now()
);

create index if not exists opener_feedback_created_idx on opener_feedback (created_at desc);

alter table opener_feedback enable row level security;
drop policy if exists opener_feedback_all on opener_feedback;
create policy opener_feedback_all on opener_feedback
  for all to authenticated using (true) with check (true);
