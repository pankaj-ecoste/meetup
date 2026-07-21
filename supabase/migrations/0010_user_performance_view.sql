-- user_performance: derived scores — never a stored column.
-- Security note: this view is queried ONLY by the FastAPI backend (service-role key).
-- Access control is enforced in the performance router, not here.
-- Standard users read only their own row (/performance/me).
-- Leadership tier reads all rows (/performance/org) — checked in FastAPI before querying.

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
