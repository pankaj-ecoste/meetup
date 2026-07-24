-- recording_jobs: Supabase-table-as-queue for the async AI pipeline.
-- Frontend subscribes to this via Realtime to know when extraction is done.
create type job_type   as enum ('task_delegation', 'meeting', 'idea');
create type job_status as enum ('pending', 'transcribing', 'extracting', 'done', 'error');

create table if not exists recording_jobs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references users(id),
  job_type    job_type    not null,
  audio_url   text        not null,
  status      job_status  not null default 'pending',
  transcript  text,
  result      jsonb,       -- the structured extraction Claude/OpenAI returned
  error_msg   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger recording_jobs_updated_at
  before update on recording_jobs
  for each row execute function set_updated_at();

alter table recording_jobs enable row level security;

-- Owner can read their own job (Realtime subscription uses this)
create policy "jobs_read_owner"
  on recording_jobs for select
  to authenticated
  using (user_id = (select id from users where auth_id = auth.uid()));

-- Owner can insert
create policy "jobs_insert_owner"
  on recording_jobs for insert
  to authenticated
  with check (user_id = (select id from users where auth_id = auth.uid()));

-- Enable Realtime: the frontend subscribes to status changes on this table.
-- Without adding it to the supabase_realtime publication, UPDATE events are
-- never broadcast and the UI spinner hangs forever. REPLICA IDENTITY FULL is
-- required so RLS is applied correctly to UPDATE events under Realtime.
alter table recording_jobs replica identity full;
alter publication supabase_realtime add table recording_jobs;
