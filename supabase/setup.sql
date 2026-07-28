-- ============================================================
-- MeetUp — FULL DATABASE SETUP
--
-- Run this ONCE on a brand-new, empty Supabase project:
--   Supabase dashboard -> SQL Editor -> New query
--   -> paste this entire file -> Run
--
-- It creates everything the app needs:
--   * 8 tables      companies, designations, users, tasks, task_extensions,
--                   meetings, ideas, recording_jobs
--   * 2 views       user_performance, leadership_task_register
--   * RLS policies on every table
--   * the updated_at trigger
--   * performance indexes (sized for 200-300 users)
--   * the private `audio` storage bucket
--   * seed rows     3 companies (Ecoste/Lamora/Metamask)
--                   2 designations (CEO = leadership, Employee = standard)
--
-- This is the consolidated form of migrations 0001-0018. Use THIS file for a
-- fresh database. Use migrations/ only to upgrade a database that already has
-- an older version of the schema. See README.md in this folder.
--
-- Safe to re-run: every statement is idempotent (create if not exists /
-- on conflict do nothing).
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

-- ── 0015: one-time claim + password login (replaces OTP-every-login) ────
alter table users add column if not exists password_set boolean not null default false;
create index if not exists idx_users_claimable        on users (is_active, password_set);

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

-- ── 0016: company codes + collapse designations to 2 global roles ───────
-- (Company UUIDs were confusing to reference by hand; designations.company_id
-- was never actually filtered on anywhere in the app, so it's relaxed and the
-- old per-company designation set collapses to exactly 2 rows: "Employee"
-- (standard) and "CEO" (leadership — cross-company delegation + full
-- cross-org dashboard). See migrations/0016_company_code_and_ceo_designation.sql.)
alter table companies add column if not exists code smallint;
update companies set code = 1001 where name = 'Ecoste';
update companies set code = 1002 where name = 'Lamora';
update companies set code = 1003 where name = 'Metamask';
alter table companies alter column code set not null;
create unique index if not exists idx_companies_code on companies (code);

alter table designations alter column company_id drop not null;

update users set designation_id = '00000000-0000-0000-0002-000000000002'
  where designation_id = '00000000-0000-0000-0001-000000000001'
     or designation_id = '00000000-0000-0000-0002-000000000001';

update designations set company_id = null
  where id = '00000000-0000-0000-0002-000000000002'; -- CEO
update designations set name = 'Employee', company_id = null
  where id = '00000000-0000-0000-0001-000000000001'; -- was Ecoste Team Lead

delete from designations where id not in (
  '00000000-0000-0000-0002-000000000002', -- CEO
  '00000000-0000-0000-0001-000000000001'  -- Employee
);

-- ── 0017: companies.id / designations.id themselves become the small,
-- human-friendly ids (not a side "code" column) ──────────────────────────
-- See migrations/0017_small_ids_for_companies_and_designations.sql for the
-- full commented version; identical SQL, run as one transaction.
begin;

drop view if exists user_performance;
drop policy if exists "users_update_own" on users;

do $$
declare r record;
begin
  for r in
    select conname, conrelid::regclass::text as tbl
    from pg_constraint
    where confrelid in ('companies'::regclass, 'designations'::regclass)
      and contype = 'f'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

drop index if exists idx_designations_company;
alter table designations drop column if exists company_id;

alter table designations add column if not exists new_id text;
update designations set new_id = case when capability_tier = 'leadership' then '00' else '01' end;

alter table companies add column if not exists new_id smallint;
update companies set new_id = code;

alter table users add column if not exists new_company_id smallint;
update users u set new_company_id = c.new_id from companies c where u.company_id = c.id;

alter table users add column if not exists new_designation_id text;
update users u set new_designation_id = d.new_id from designations d where u.designation_id = d.id;

alter table meetings add column if not exists new_company_id smallint;
update meetings m set new_company_id = c.new_id from companies c where m.company_id = c.id;

alter table users drop column company_id;
alter table users rename column new_company_id to company_id;
alter table users alter column company_id set not null;

alter table users drop column designation_id;
alter table users rename column new_designation_id to designation_id;

alter table meetings drop column company_id;
alter table meetings rename column new_company_id to company_id;
alter table meetings alter column company_id set not null;

alter table designations drop constraint if exists designations_pkey;
alter table designations drop column id;
alter table designations rename column new_id to id;
alter table designations add primary key (id);

alter table companies drop constraint if exists companies_pkey;
alter table companies drop column id;
alter table companies rename column new_id to id;
alter table companies add primary key (id);
alter table companies drop column if exists code;

alter table users add constraint users_company_id_fkey
  foreign key (company_id) references companies(id);
alter table users add constraint users_designation_id_fkey
  foreign key (designation_id) references designations(id);
alter table meetings add constraint meetings_company_id_fkey
  foreign key (company_id) references companies(id);

create index if not exists idx_users_company    on users (company_id);
create index if not exists idx_users_designation on users (designation_id);
create index if not exists idx_meetings_company on meetings (company_id);

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
    where t.status = 'completed'
      and t.completed_at <= t.deadline
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

commit;

-- ── 0018: leadership_task_register view ──────────────────────
-- Flat, description-free view of every task, for the leadership-only
-- org-wide task register (plan.md §7.5 Part A). Same security pattern as
-- user_performance: queried only by /api/leadership/tasks with the
-- service-role client, gated on capability_tier = 'leadership' in the route.
create or replace view leadership_task_register as
select
  t.id            as task_id,
  t.source,
  t.status,
  t.created_at    as assigned_date,
  t.deadline,
  t.assignor_id,
  ar.name         as assignor_name,
  ar.email        as assignor_email,
  t.assignee_id,
  ae.name         as assignee_name,
  ae.email        as assignee_email,
  ae.company_id,
  c.name          as company_name
from tasks t
join users ar on ar.id = t.assignor_id
join users ae on ae.id = t.assignee_id
join companies c on c.id = ae.company_id;

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
--   1001,
--   '00'
-- );
