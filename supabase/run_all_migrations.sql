-- ============================================================
-- MeetUp — Combined migrations + seed
-- Paste this entire file into Supabase SQL Editor and click Run
-- ============================================================


-- ── 0001: companies ──────────────────────────────────────────
create table if not exists companies (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

alter table companies enable row level security;

create policy "companies_read_authenticated"
  on companies for select
  to authenticated
  using (true);


-- ── 0002: designations ───────────────────────────────────────
create table if not exists designations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  capability_tier text not null default 'standard' check (capability_tier in ('standard', 'leadership')),
  company_id      uuid not null references companies(id)
);

alter table designations enable row level security;

create policy "designations_read_authenticated"
  on designations for select
  to authenticated
  using (true);


-- ── 0003: users ──────────────────────────────────────────────
create table if not exists users (
  id             uuid primary key default gen_random_uuid(),
  auth_id        uuid unique references auth.users(id) on delete set null,
  name           text not null,
  email          text not null unique,
  phone          text,
  is_active      boolean not null default true,
  company_id     uuid not null references companies(id),
  designation_id uuid references designations(id),
  created_at     timestamptz not null default now()
);

alter table users enable row level security;

create policy "users_read_active"
  on users for select
  to authenticated
  using (is_active = true);

create policy "users_update_own"
  on users for update
  to authenticated
  using (auth_id = auth.uid())
  with check (
    auth_id = auth.uid()
    and (
      designation_id is null
      or exists (
        select 1 from designations d
        where d.id = designation_id
          and d.capability_tier = 'standard'
      )
    )
  );


-- ── 0004: tasks ──────────────────────────────────────────────
create type task_source as enum ('task_delegation', 'meeting');
create type task_status as enum ('open', 'completed', 'overdue');

create table if not exists tasks (
  id                uuid        primary key default gen_random_uuid(),
  source            task_source not null,
  meeting_id        uuid,
  assignor_id       uuid        not null references users(id),
  assignee_id       uuid        not null references users(id),
  description       text        not null,
  deadline          timestamptz not null,
  original_deadline timestamptz not null,
  report_to_id      uuid        not null references users(id),
  status            task_status not null default 'open',
  completed_at      timestamptz,
  completion_note   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table tasks enable row level security;

create policy "tasks_read_assignee"
  on tasks for select
  to authenticated
  using (
    assignee_id = (select id from users where auth_id = auth.uid())
  );

create policy "tasks_read_assignor"
  on tasks for select
  to authenticated
  using (
    assignor_id = (select id from users where auth_id = auth.uid())
  );

create policy "tasks_insert_assignor"
  on tasks for insert
  to authenticated
  with check (
    assignor_id = (select id from users where auth_id = auth.uid())
  );

create policy "tasks_update_parties"
  on tasks for update
  to authenticated
  using (
    assignee_id = (select id from users where auth_id = auth.uid())
    or assignor_id = (select id from users where auth_id = auth.uid())
  );


-- ── 0005: task_extensions ────────────────────────────────────
create type extension_status as enum ('requested', 'approved', 'denied');

create table if not exists task_extensions (
  id                uuid             primary key default gen_random_uuid(),
  task_id           uuid             not null references tasks(id) on delete cascade,
  requested_by      uuid             not null references users(id),
  reason            text             not null,
  proposed_deadline timestamptz      not null,
  status            extension_status not null default 'requested',
  decided_by        uuid             references users(id),
  decided_at        timestamptz,
  created_at        timestamptz      not null default now()
);

alter table task_extensions enable row level security;

create policy "extensions_read_parties"
  on task_extensions for select
  to authenticated
  using (
    requested_by = (select id from users where auth_id = auth.uid())
    or exists (
      select 1 from tasks t
      where t.id = task_id
        and t.assignor_id = (select id from users where auth_id = auth.uid())
    )
  );

create policy "extensions_insert_assignee"
  on task_extensions for insert
  to authenticated
  with check (
    requested_by = (select id from users where auth_id = auth.uid())
    and exists (
      select 1 from tasks t
      where t.id = task_id
        and t.assignee_id = (select id from users where auth_id = auth.uid())
    )
  );

create policy "extensions_update_assignor"
  on task_extensions for update
  to authenticated
  using (
    exists (
      select 1 from tasks t
      where t.id = task_id
        and t.assignor_id = (select id from users where auth_id = auth.uid())
    )
  );


-- ── 0006: meetings ───────────────────────────────────────────
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

create policy "meetings_update_recorder"
  on meetings for update
  to authenticated
  using (
    recorded_by = (select id from users where auth_id = auth.uid())
  );


-- ── 0007: ideas ──────────────────────────────────────────────
create table if not exists ideas (
  id          uuid        primary key default gen_random_uuid(),
  recorded_by uuid        not null references users(id),
  summary     text        not null,
  tags        text[]      not null default '{}',
  created_at  timestamptz not null default now()
);

alter table ideas enable row level security;

create policy "ideas_read_all"
  on ideas for select
  to authenticated
  using (true);

create policy "ideas_insert_authenticated"
  on ideas for insert
  to authenticated
  with check (
    recorded_by = (select id from users where auth_id = auth.uid())
  );


-- ── 0008: FK tasks → meetings ────────────────────────────────
alter table tasks
  add constraint tasks_meeting_id_fkey
  foreign key (meeting_id) references meetings(id) on delete set null;


-- ── 0009: updated_at trigger ─────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_updated_at
  before update on tasks
  for each row execute function set_updated_at();


-- ── 0010: user_performance view ──────────────────────────────
create or replace view user_performance as
select
  u.id                                                        as user_id,
  u.name,
  u.email,
  u.company_id,
  c.name                                                      as company_name,
  d.capability_tier,
  count(t.id)                                                 as total_tasks,
  count(t.id) filter (where t.status = 'completed')          as completed_tasks,
  count(t.id) filter (
    where t.status = 'completed' and t.completed_at <= t.deadline
  )                                                           as on_time_tasks,
  case
    when count(t.id) filter (where t.status = 'completed') = 0 then null
    else round(
      100.0
      * count(t.id) filter (where t.status = 'completed' and t.completed_at <= t.deadline)
      / count(t.id) filter (where t.status = 'completed'),
      1
    )
  end                                                         as on_time_pct,
  count(t.id) filter (where t.status = 'overdue')            as overdue_count,
  round(
    avg(
      extract(epoch from (t.completed_at - t.created_at)) / 86400.0
    ) filter (where t.status = 'completed'),
    1
  )                                                           as avg_days_to_complete
from users u
join companies c on c.id = u.company_id
left join designations d on d.id = u.designation_id
left join tasks t on t.assignee_id = u.id
where u.is_active = true
group by u.id, u.name, u.email, u.company_id, c.name, d.capability_tier;


-- ── 0011: recording_jobs ─────────────────────────────────────
create type job_type   as enum ('task_delegation', 'meeting', 'idea');
create type job_status as enum ('pending', 'transcribing', 'extracting', 'done', 'error');

create table if not exists recording_jobs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references users(id),
  job_type    job_type    not null,
  audio_url   text        not null,
  status      job_status  not null default 'pending',
  transcript  text,
  result      jsonb,
  error_msg   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger recording_jobs_updated_at
  before update on recording_jobs
  for each row execute function set_updated_at();

alter table recording_jobs enable row level security;

create policy "jobs_read_owner"
  on recording_jobs for select
  to authenticated
  using (user_id = (select id from users where auth_id = auth.uid()));

create policy "jobs_insert_owner"
  on recording_jobs for insert
  to authenticated
  with check (user_id = (select id from users where auth_id = auth.uid()));


-- ── 0012: audio storage bucket ───────────────────────────────
-- Backend (routers/recordings.py, BUCKET = "audio") uploads recordings here
-- and hands out short-lived signed URLs. Private bucket — no public URLs.
insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;


-- ── 0013: performance indexes (production scale: 200–300 users) ──
-- Postgres does not auto-index FKs. Every RLS policy + list view filters on
-- these columns; without indexes each query sequentially scans the whole table.
create index if not exists idx_tasks_assignee          on tasks (assignee_id);
create index if not exists idx_tasks_assignor          on tasks (assignor_id);
create index if not exists idx_tasks_report_to         on tasks (report_to_id);
create index if not exists idx_tasks_meeting           on tasks (meeting_id);
create index if not exists idx_tasks_assignee_status   on tasks (assignee_id, status);
create index if not exists idx_tasks_assignor_status   on tasks (assignor_id, status);
create index if not exists idx_tasks_status_deadline   on tasks (status, deadline);

create index if not exists idx_ext_task               on task_extensions (task_id);
create index if not exists idx_ext_task_status        on task_extensions (task_id, status);
create index if not exists idx_ext_requested_by       on task_extensions (requested_by);

create index if not exists idx_meetings_recorded_by   on meetings (recorded_by);
create index if not exists idx_meetings_company       on meetings (company_id);

create index if not exists idx_ideas_recorded_by      on ideas (recorded_by);
create index if not exists idx_ideas_created_at       on ideas (created_at desc);
create index if not exists idx_ideas_tags_gin         on ideas using gin (tags);

create index if not exists idx_jobs_user              on recording_jobs (user_id);
create index if not exists idx_jobs_status            on recording_jobs (status);

-- ── 0014: submit+webhook pipeline — correlate AssemblyAI callback to job ──
alter table recording_jobs add column if not exists transcript_id text;
create index if not exists idx_jobs_transcript_id     on recording_jobs (transcript_id);

create index if not exists idx_users_company          on users (company_id);
create index if not exists idx_users_designation      on users (designation_id);
create index if not exists idx_designations_company   on designations (company_id);


-- ── seed: companies + designations ───────────────────────────
insert into companies (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Ecoste'),
  ('00000000-0000-0000-0000-000000000002', 'Lamora'),
  ('00000000-0000-0000-0000-000000000003', 'Metamask')
on conflict (name) do nothing;

insert into designations (id, name, capability_tier, company_id) values
  ('00000000-0000-0000-0001-000000000001', 'Team Lead',  'standard',   '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0001-000000000002', 'Executive',  'standard',   '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0001-000000000003', 'Manager',    'standard',   '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0001-000000000004', 'Team Lead',  'standard',   '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0001-000000000005', 'Executive',  'standard',   '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0001-000000000006', 'Manager',    'standard',   '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0001-000000000007', 'Team Lead',  'standard',   '00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0001-000000000008', 'Executive',  'standard',   '00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0001-000000000009', 'Manager',    'standard',   '00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0002-000000000001', 'Founder',    'leadership', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0002-000000000002', 'CEO',        'leadership', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0002-000000000003', 'Director',   'leadership', '00000000-0000-0000-0000-000000000001')
on conflict do nothing;

-- ── Founder user row ─────────────────────────────────────────
-- Run this AFTER the founder logs in via OTP for the first time.
-- Replace <FOUNDER_AUTH_UID> with the UUID from Authentication → Users in Supabase dashboard.
--
-- insert into users (id, auth_id, name, email, company_id, designation_id)
-- values (
--   gen_random_uuid(),
--   '<FOUNDER_AUTH_UID>',
--   'pankaj_ecoste',
--   'ai.support@ecoste.in',
--   '00000000-0000-0000-0000-000000000001',
--   '00000000-0000-0000-0002-000000000001'
-- );
