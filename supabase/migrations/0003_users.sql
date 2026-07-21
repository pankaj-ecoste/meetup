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

-- A user can read any active user (needed for Doer / Report To dropdowns)
create policy "users_read_active"
  on users for select
  to authenticated
  using (is_active = true);

-- A user can update only their own row — and cannot change designation_id to a leadership tier
create policy "users_update_own"
  on users for update
  to authenticated
  using (auth_id = auth.uid())
  with check (
    auth_id = auth.uid()
    and (
      -- designation_id unchanged, OR the new designation is standard tier
      designation_id is null
      or exists (
        select 1 from designations d
        where d.id = designation_id
          and d.capability_tier = 'standard'
      )
    )
  );
