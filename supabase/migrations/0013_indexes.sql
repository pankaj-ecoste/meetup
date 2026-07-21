-- ── 0013: performance indexes ────────────────────────────────
-- Required for production scale (200–300 users). Postgres does NOT auto-index
-- foreign keys, and every RLS policy + list view filters on these columns.
-- Without them, each query does a sequential scan of the whole table — fine for
-- a 5-person pilot, unusable once tasks/ideas run into the thousands.

-- tasks: the hot table. RLS filters by assignee_id / assignor_id on every read;
-- the dashboard counts by status; the overdue job scans open tasks past deadline.
create index if not exists idx_tasks_assignee          on tasks (assignee_id);
create index if not exists idx_tasks_assignor          on tasks (assignor_id);
create index if not exists idx_tasks_report_to         on tasks (report_to_id);
create index if not exists idx_tasks_meeting           on tasks (meeting_id);
create index if not exists idx_tasks_assignee_status   on tasks (assignee_id, status);
create index if not exists idx_tasks_assignor_status   on tasks (assignor_id, status);
create index if not exists idx_tasks_status_deadline   on tasks (status, deadline);

-- task_extensions: pending-badge lookups by task + status; "my requests" by user.
create index if not exists idx_ext_task               on task_extensions (task_id);
create index if not exists idx_ext_task_status        on task_extensions (task_id, status);
create index if not exists idx_ext_requested_by       on task_extensions (requested_by);

-- meetings: Meetings view lists by recorder; company scoping.
create index if not exists idx_meetings_recorded_by   on meetings (recorded_by);
create index if not exists idx_meetings_company       on meetings (company_id);

-- ideas: universal feed ordered/filtered by recency; tag search uses @> (needs GIN).
create index if not exists idx_ideas_recorded_by      on ideas (recorded_by);
create index if not exists idx_ideas_created_at       on ideas (created_at desc);
create index if not exists idx_ideas_tags_gin         on ideas using gin (tags);

-- recording_jobs: owner polls their own jobs; workers scan by status.
create index if not exists idx_jobs_user              on recording_jobs (user_id);
create index if not exists idx_jobs_status            on recording_jobs (status);

-- users / designations: profile lookups and dropdown population by company.
create index if not exists idx_users_company          on users (company_id);
create index if not exists idx_users_designation      on users (designation_id);
create index if not exists idx_designations_company   on designations (company_id);
