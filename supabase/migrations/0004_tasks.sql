create type task_source as enum ('task_delegation', 'meeting');
create type task_status as enum ('open', 'completed', 'overdue');

create table if not exists tasks (
  id                uuid        primary key default gen_random_uuid(),
  source            task_source not null,
  meeting_id        uuid,                  -- FK to meetings added in 0008 after meetings table exists
  assignor_id       uuid        not null references users(id),
  assignee_id       uuid        not null references users(id),
  description       text        not null,
  deadline          timestamptz not null,
  original_deadline timestamptz not null,  -- captured once at creation, never changed
  report_to_id      uuid        not null references users(id),
  status            task_status not null default 'open',
  completed_at      timestamptz,           -- set when status → completed; required for on-time scoring
  completion_note   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table tasks enable row level security;

-- Assignee can see their received tasks
create policy "tasks_read_assignee"
  on tasks for select
  to authenticated
  using (
    assignee_id = (select id from users where auth_id = auth.uid())
  );

-- Assignor can see their allocated tasks
create policy "tasks_read_assignor"
  on tasks for select
  to authenticated
  using (
    assignor_id = (select id from users where auth_id = auth.uid())
  );

-- Assignor can insert (they are always the logged-in recorder)
create policy "tasks_insert_assignor"
  on tasks for insert
  to authenticated
  with check (
    assignor_id = (select id from users where auth_id = auth.uid())
  );

-- Assignee or assignor can update (mark complete, approve extension result)
create policy "tasks_update_parties"
  on tasks for update
  to authenticated
  using (
    assignee_id = (select id from users where auth_id = auth.uid())
    or assignor_id = (select id from users where auth_id = auth.uid())
  );
