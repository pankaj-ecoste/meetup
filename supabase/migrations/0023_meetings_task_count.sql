-- ── 0023: meetings.task_count + created_at index ──────────────────────────
-- ADDITIVE and safe to run more than once. Nothing existing is changed or
-- dropped, and the app works whether or not this has been run (the list
-- endpoint falls back to the old query if the column is missing).
--
-- Why: the meetings list only shows "N tasks" per row, but it was selecting the
-- whole `tasks` jsonb (up to 10 tasks x 2000 chars per meeting) just to count
-- it. A generated column lets the database keep the count itself, so the list
-- sends one small integer per row instead.
--
-- STORED generated column: Postgres recomputes it on every insert/update of
-- `tasks`, so it can never drift. jsonb_array_length is IMMUTABLE (required for
-- generated columns) and is already used by the meetings_max_10_tasks check on
-- this same column, so it is known to work for every existing row.
-- The table is small (v2 started empty), so the one-off rewrite is instant.

alter table meetings
  add column if not exists task_count int
  generated always as (jsonb_array_length(tasks)) stored;

-- The admin "all meetings" list orders by created_at with no recorder filter.
-- The existing index is (recorded_by, created_at desc), which cannot serve that
-- query, so it would sort the whole table. This one serves it directly.
create index if not exists idx_meetings_created_at on meetings (created_at desc);

-- Make PostgREST (the Supabase REST layer) notice the new column immediately.
notify pgrst, 'reload schema';
