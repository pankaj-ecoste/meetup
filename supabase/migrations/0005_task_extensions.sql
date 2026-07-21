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

-- Doer (requested_by) and assignor can read extensions on their tasks
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

-- Only the doer (assignee) can create an extension request
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

-- Only the assignor can approve/deny
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
