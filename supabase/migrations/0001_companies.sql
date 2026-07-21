create table if not exists companies (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

alter table companies enable row level security;

-- All authenticated users can read companies (needed for dropdowns)
create policy "companies_read_authenticated"
  on companies for select
  to authenticated
  using (true);
