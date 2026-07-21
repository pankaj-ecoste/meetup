-- ── 0012: audio storage bucket ───────────────────────────────
-- The backend (routers/recordings.py, BUCKET = "audio") uploads recordings
-- here using the service-role key and hands out short-lived signed URLs.
-- Nothing in 0001–0011 creates this bucket, so a fresh project must run this.
--
-- Private bucket: no public URLs ever (plan §18, Locked Decisions).
-- Playback works via create_signed_url; the frontend never touches storage
-- directly, and the backend uses the service-role key which bypasses RLS —
-- so no storage.objects policies are needed for Phase 1.

insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;
