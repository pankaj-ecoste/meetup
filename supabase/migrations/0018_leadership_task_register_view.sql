-- leadership_task_register: flat, description-free view of every task, for
-- the leadership-only org-wide task register (plan.md §7.5 Part A).
-- Security note: same pattern as user_performance (0010) — this view is
-- queried ONLY by /api/leadership/tasks using the service-role client, which
-- checks capability_tier = 'leadership' before ever running the query.
-- `description` is deliberately never selected here — the register is
-- metadata-only by locked design (2026-07-24), enforced structurally by this
-- view never exposing the column, not by filtering it out downstream.

create or replace view leadership_task_register as
select
  t.id            as task_id,
  t.source,
  t.status,
  t.created_at    as assigned_date,
  t.deadline,
  t.assignor_id,
  ar.name         as assignor_name,
  ar.email        as assignor_email,
  t.assignee_id,
  ae.name         as assignee_name,
  ae.email        as assignee_email,
  ae.company_id,
  c.name          as company_name
from tasks t
join users ar on ar.id = t.assignor_id
join users ae on ae.id = t.assignee_id
join companies c on c.id = ae.company_id;
