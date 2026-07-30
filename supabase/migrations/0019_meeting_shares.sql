-- ── 0019: meeting_shares — MoM sharing (plan.md §8.10) ───────────────────
-- A recorder can share a saved meeting's MoM with any number of other
-- users. One row per (meeting, recipient). meetings' own SELECT policy is
-- widened so a recipient can read the meeting they were shared, without
-- needing to have recorded it themselves.

create table if not exists meeting_shares (
  id                  uuid        primary key default gen_random_uuid(),
  meeting_id          uuid        not null references meetings(id) on delete cascade,
  shared_with_user_id uuid        not null references users(id),
  shared_by           uuid        not null references users(id),
  created_at          timestamptz not null default now()
);

create unique index if not exists idx_meeting_shares_unique
  on meeting_shares (meeting_id, shared_with_user_id);
create index if not exists idx_meeting_shares_recipient
  on meeting_shares (shared_with_user_id);
create index if not exists idx_meeting_shares_meeting
  on meeting_shares (meeting_id);

alter table meeting_shares enable row level security;

create policy "meeting_shares_read_parties"
  on meeting_shares for select
  to authenticated
  using (
    shared_with_user_id = (select id from users where auth_id = auth.uid())
    or shared_by = (select id from users where auth_id = auth.uid())
  );

create policy "meeting_shares_insert_recorder"
  on meeting_shares for insert
  to authenticated
  with check (
    shared_by = (select id from users where auth_id = auth.uid())
    and exists (
      select 1 from meetings m
      where m.id = meeting_id
        and m.recorded_by = (select id from users where auth_id = auth.uid())
    )
  );

drop policy if exists "meetings_read_recorder" on meetings;
create policy "meetings_read_recorder_or_shared"
  on meetings for select
  to authenticated
  using (
    recorded_by = (select id from users where auth_id = auth.uid())
    or exists (
      select 1 from meeting_shares ms
      where ms.meeting_id = meetings.id
        and ms.shared_with_user_id = (select id from users where auth_id = auth.uid())
    )
  );
