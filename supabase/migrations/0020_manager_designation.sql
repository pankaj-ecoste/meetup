-- ── 0020: Manager designation — company-scoped leadership tier ─────
-- A third capability_tier sitting between 'standard' and 'leadership'.
-- A Manager delegates and sees scores/reports only within their own
-- company (enforced in app routes, scoped by the caller's company_id) —
-- never cross-org like 'leadership'. See plan.md §8.11.

alter table designations drop constraint if exists designations_capability_tier_check;
alter table designations add constraint designations_capability_tier_check
  check (capability_tier in ('standard', 'manager', 'leadership'));

insert into designations (id, name, capability_tier) values
  ('02', 'Manager', 'manager')
on conflict (id) do nothing;
