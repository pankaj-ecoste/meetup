create table if not exists designations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  capability_tier text not null default 'standard' check (capability_tier in ('standard', 'leadership')),
  company_id      uuid not null references companies(id)
);

alter table designations enable row level security;

-- All authenticated users can read designations (needed for dropdowns)
create policy "designations_read_authenticated"
  on designations for select
  to authenticated
  using (true);
