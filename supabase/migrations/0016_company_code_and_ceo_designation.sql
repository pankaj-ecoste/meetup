-- 0016: admin-friendly company codes + collapse designations to exactly 2
-- global roles.
--
-- Company UUIDs were confusing to reference by hand (e.g. when adding an
-- employee via SQL) — give each company a short 4-digit `code` instead.
--
-- designations.company_id was never actually filtered on anywhere in the
-- app (only designation_id is joined from `users`), so it's dead weight.
-- Collapse the old per-company designation set (Team Lead/Executive/
-- Manager/Founder/CEO/Director) down to exactly 2 GLOBAL designations:
-- "Employee" (standard) and "CEO" (leadership — can delegate to anyone
-- across all three companies and sees the full cross-org dashboard).

alter table companies add column if not exists code smallint;
update companies set code = 1001 where name = 'Ecoste';
update companies set code = 1002 where name = 'Lamora';
update companies set code = 1003 where name = 'Metamask';
alter table companies alter column code set not null;
create unique index if not exists idx_companies_code on companies (code);

alter table designations alter column company_id drop not null;

-- Repoint the founder (currently on the old 'Founder' row) to the surviving
-- CEO row before any old rows are deleted.
update users set designation_id = '00000000-0000-0000-0002-000000000002'
  where designation_id = '00000000-0000-0000-0001-000000000001'
     or designation_id = '00000000-0000-0000-0002-000000000001';

-- Reuse two existing rows as the new global designations rather than
-- minting fresh ids: the existing Ecoste 'CEO' row, and one existing
-- 'Team Lead' row renamed to 'Employee'.
update designations set company_id = null
  where id = '00000000-0000-0000-0002-000000000002'; -- CEO
update designations set name = 'Employee', company_id = null
  where id = '00000000-0000-0000-0001-000000000001'; -- was Ecoste Team Lead

-- Drop every other now-unreferenced designation row (Founder, Director, the
-- other Team Lead/Executive/Manager rows).
delete from designations where id not in (
  '00000000-0000-0000-0002-000000000002', -- CEO
  '00000000-0000-0000-0001-000000000001'  -- Employee
);
