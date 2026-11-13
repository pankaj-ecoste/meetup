-- ── 0022: v2 — MeetUp becomes "record a meeting → Google Sheet" ───────────
-- See .claude/plan.md §12.0 (final spec).
--
-- ⚠️ DESTRUCTIVE. Drops tasks, task_extensions, ideas, meeting_shares,
-- push_subscriptions, the old meetings table, companies and designations.
-- The owner confirmed (2026-11-13) that old data is not needed.
-- Employee rows + their auth logins are KEPT (users table survives).
--
-- Run ONCE in the Supabase SQL Editor, AFTER deploying nothing else — the new
-- code and this migration go live together (see the hand-over steps).

begin;

-- 1) Remove everything built on tasks / ideas / sharing / push ---------------
drop view  if exists leadership_task_register cascade;
drop view  if exists user_performance cascade;
drop table if exists meeting_shares     cascade;
drop table if exists task_extensions    cascade;
drop table if exists tasks              cascade;
drop table if exists ideas              cascade;
drop table if exists push_subscriptions cascade;
drop table if exists meetings           cascade;

-- Old recording jobs (task / idea / old-meeting recordings and their
-- transcripts + AI results) belong to the data being discarded. The new
-- meetings table starts empty, so no job is referenced by anything.
delete from recording_jobs;

-- 2) users: two roles instead of company + designation ----------------------
alter table users add column if not exists role text;

-- Old CEO tier ('leadership') becomes admin; everyone else is an employee.
update users u
   set role = case when d.capability_tier = 'leadership' then 'admin' else 'employee' end
  from designations d
 where u.designation_id = d.id;
update users set role = 'employee' where role is null;

alter table users alter column role set not null;
alter table users alter column role set default 'employee';
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('admin', 'employee'));

-- Users are now written only by the server (service role); nobody edits their
-- own row from the browser.
drop policy if exists "users_update_own" on users;

drop index if exists idx_users_company;
drop index if exists idx_users_designation;
drop index if exists idx_users_claimable;
alter table users drop column if exists company_id;
alter table users drop column if exists designation_id;
alter table users drop column if exists password_set;

drop table if exists designations cascade;
drop table if exists companies    cascade;

-- 3) departments (one sheet tab each; tab name = department name) -----------
create table if not exists departments (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists departments_name_lower_uq on departments (lower(name));

alter table departments enable row level security;
drop policy if exists "departments_read_authenticated" on departments;
create policy "departments_read_authenticated"
  on departments for select
  to authenticated
  using (true);

-- 4) meetings (new shape) ---------------------------------------------------
create table meetings (
  id                uuid        primary key default gen_random_uuid(),
  job_id            uuid        unique references recording_jobs(id) on delete set null,
  recorded_by       uuid        references users(id) on delete set null,
  -- Snapshot of the recorder, so the meeting stays attributable after the
  -- employee is removed.
  recorded_by_name  text        not null,
  recorded_by_email text        not null,
  department_id     uuid        references departments(id) on delete set null,
  department_name   text        not null,
  title             text        not null,
  mom               text        not null,
  -- [{ assignee, description, deadline (YYYY-MM-DD | null), reporting_to }] — max 10
  tasks             jsonb       not null default '[]'::jsonb,
  transcript        text,
  sheet_status      text        not null default 'pending'
                    check (sheet_status in ('pending', 'synced', 'failed')),
  sheet_error       text,
  sheet_id          text,
  sheet_synced_at   timestamptz,
  created_at        timestamptz not null default now(),
  constraint meetings_max_10_tasks check (jsonb_array_length(tasks) <= 10)
);

create index idx_meetings_recorded_by on meetings (recorded_by, created_at desc);
create index idx_meetings_sheet_status on meetings (sheet_status) where sheet_status <> 'synced';

alter table meetings enable row level security;
create policy "meetings_read_recorder"
  on meetings for select
  to authenticated
  using (recorded_by = (select id from users where auth_id = auth.uid()));

-- 5) app_settings: the single linked-sheet row ------------------------------
create table if not exists app_settings (
  id         int         primary key default 1 check (id = 1),
  sheet_id   text,
  sheet_url  text,
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values (1) on conflict (id) do nothing;
-- RLS on, no policies: only the server (service role) can touch it.
alter table app_settings enable row level security;

-- 6) recording_jobs: only meetings now --------------------------------------
-- (The enum keeps its old values — removing enum values is not worth the
-- risk. The API only ever creates 'meeting' jobs.)

commit;
