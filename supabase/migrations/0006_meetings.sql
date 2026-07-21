create table if not exists meetings (
  id          uuid        primary key default gen_random_uuid(),
  recorded_by uuid        not null references users(id),
  company_id  uuid        not null references companies(id),
  transcript  text,
  audio_url   text,
  mom_summary text,
  created_at  timestamptz not null default now()
);

alter table meetings enable row level security;

-- Recorder can read/insert their own meetings
create policy "meetings_read_recorder"
  on meetings for select
  to authenticated
  using (
    recorded_by = (select id from users where auth_id = auth.uid())
  );

create policy "meetings_insert_recorder"
  on meetings for insert
  to authenticated
  with check (
    recorded_by = (select id from users where auth_id = auth.uid())
  );

-- Recorder can update (e.g. AI fills in transcript/mom after async job)
create policy "meetings_update_recorder"
  on meetings for update
  to authenticated
  using (
    recorded_by = (select id from users where auth_id = auth.uid())
  );
