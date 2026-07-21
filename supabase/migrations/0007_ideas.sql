create table if not exists ideas (
  id          uuid        primary key default gen_random_uuid(),
  recorded_by uuid        not null references users(id),
  summary     text        not null,
  tags        text[]      not null default '{}',
  created_at  timestamptz not null default now()
);

alter table ideas enable row level security;

-- All authenticated users can read all ideas (universal feed)
create policy "ideas_read_all"
  on ideas for select
  to authenticated
  using (true);

-- Any authenticated user can insert an idea
create policy "ideas_insert_authenticated"
  on ideas for insert
  to authenticated
  with check (
    recorded_by = (select id from users where auth_id = auth.uid())
  );
