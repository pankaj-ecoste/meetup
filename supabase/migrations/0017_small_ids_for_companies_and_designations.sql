-- 0017: make companies.id and designations.id themselves the small,
-- human-friendly identifiers (not a side "code" column) — companies.id
-- becomes the 4-digit number (1001/1002/1003), designations.id becomes
-- '00' (CEO) / '01' (Employee). Touches every FK that references these two
-- tables: users.company_id, users.designation_id, meetings.company_id, and
-- the user_performance view (which must be dropped and recreated, since
-- Postgres won't let you change the type of a column a view depends on).
--
-- Run as one transaction — if anything fails partway, it all rolls back.

begin;

-- 1) Drop the view first; it depends on the column types we're about to change.
drop view if exists user_performance;

-- 1b) Drop the RLS policy that references designation_id — it must be gone
--     before that column can be dropped, and gets recreated at the end.
drop policy if exists "users_update_own" on users;

-- 2) Drop every FK constraint that references companies/designations, found
--    dynamically so this doesn't depend on guessing Postgres's auto-generated
--    constraint names.
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

-- 3) designations.company_id was already confirmed dead weight (never
--    filtered on by the app, always null after 0016) — drop it entirely.
drop index if exists idx_designations_company;
alter table designations drop column if exists company_id;

-- 4) Compute the new small ids on the two dimension tables.
alter table designations add column if not exists new_id text;
update designations set new_id = case when capability_tier = 'leadership' then '00' else '01' end;

alter table companies add column if not exists new_id smallint;
update companies set new_id = code; -- reuse the 4-digit code from migration 0016

-- 5) Propagate the new ids onto every referencing table BEFORE dropping the
--    old uuid columns (so nothing is orphaned mid-migration).
alter table users add column if not exists new_company_id smallint;
update users u set new_company_id = c.new_id from companies c where u.company_id = c.id;

alter table users add column if not exists new_designation_id text;
update users u set new_designation_id = d.new_id from designations d where u.designation_id = d.id;

alter table meetings add column if not exists new_company_id smallint;
update meetings m set new_company_id = c.new_id from companies c where m.company_id = c.id;

-- 6) Swap the old uuid FK columns for the new small-typed ones.
alter table users drop column company_id;
alter table users rename column new_company_id to company_id;
alter table users alter column company_id set not null;

alter table users drop column designation_id;
alter table users rename column new_designation_id to designation_id;

alter table meetings drop column company_id;
alter table meetings rename column new_company_id to company_id;
alter table meetings alter column company_id set not null;

-- 7) Re-key the primary keys themselves.
alter table designations drop constraint if exists designations_pkey;
alter table designations drop column id;
alter table designations rename column new_id to id;
alter table designations add primary key (id);

alter table companies drop constraint if exists companies_pkey;
alter table companies drop column id;
alter table companies rename column new_id to id;
alter table companies add primary key (id);
alter table companies drop column if exists code; -- redundant now that id IS the 4-digit code

-- 8) Re-add the foreign keys against the new small-typed primary keys.
alter table users add constraint users_company_id_fkey
  foreign key (company_id) references companies(id);
alter table users add constraint users_designation_id_fkey
  foreign key (designation_id) references designations(id);
alter table meetings add constraint meetings_company_id_fkey
  foreign key (company_id) references companies(id);

-- 9) Recreate the indexes that were dropped along with the old columns.
create index if not exists idx_users_company    on users (company_id);
create index if not exists idx_users_designation on users (designation_id);
create index if not exists idx_meetings_company on meetings (company_id);

-- 10) Recreate the RLS policy dropped in step 1b (identical definition,
--     now comparing against the text-typed designation_id).
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

-- 11) Recreate the performance view (identical definition to 0010, now
--     running against the smaller id types).
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
