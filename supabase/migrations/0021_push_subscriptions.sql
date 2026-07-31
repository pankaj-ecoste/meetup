-- ── 0021: push_subscriptions — Web Push endpoints (plan.md §8.14) ────────
-- One row per browser/device a user has enabled notifications on. `endpoint`
-- is unique per browser install, so re-subscribing (e.g. after clearing site
-- data) upserts rather than duplicating. Sent to via the service-role client
-- only (lib/server/webpush.ts) — there is no client-side read/write path
-- beyond the owner managing their own rows.

create table if not exists push_subscriptions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references users(id) on delete cascade,
  endpoint   text        not null unique,
  p256dh     text        not null,
  auth       text        not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user
  on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

create policy "push_subscriptions_read_own"
  on push_subscriptions for select
  to authenticated
  using (user_id = (select id from users where auth_id = auth.uid()));

create policy "push_subscriptions_insert_own"
  on push_subscriptions for insert
  to authenticated
  with check (user_id = (select id from users where auth_id = auth.uid()));

create policy "push_subscriptions_delete_own"
  on push_subscriptions for delete
  to authenticated
  using (user_id = (select id from users where auth_id = auth.uid()));
