-- MeetUp seed script
-- Run ONCE after all migrations.
-- Creates companies, designations, and the founder account.
-- The founder is seeded directly with the leadership tier — no self-service path exists.

-- ── Companies ────────────────────────────────────────────────────────────────
insert into companies (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Ecoste'),
  ('00000000-0000-0000-0000-000000000002', 'Lamora'),
  ('00000000-0000-0000-0000-000000000003', 'Metamask')
on conflict (name) do nothing;

-- ── Designations ─────────────────────────────────────────────────────────────
-- Standard tier (visible in signup dropdown)
insert into designations (id, name, capability_tier, company_id) values
  ('00000000-0000-0000-0001-000000000001', 'Team Lead',      'standard',    '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0001-000000000002', 'Executive',      'standard',    '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0001-000000000003', 'Manager',        'standard',    '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0001-000000000004', 'Team Lead',      'standard',    '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0001-000000000005', 'Executive',      'standard',    '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0001-000000000006', 'Manager',        'standard',    '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0001-000000000007', 'Team Lead',      'standard',    '00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0001-000000000008', 'Executive',      'standard',    '00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0001-000000000009', 'Manager',        'standard',    '00000000-0000-0000-0000-000000000003')
on conflict do nothing;

-- Leadership tier (NEVER shown in signup dropdown; assigned here only)
insert into designations (id, name, capability_tier, company_id) values
  ('00000000-0000-0000-0002-000000000001', 'Founder',        'leadership',  '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0002-000000000002', 'CEO',            'leadership',  '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0002-000000000003', 'Director',       'leadership',  '00000000-0000-0000-0000-000000000001')
on conflict do nothing;

-- ── Founder account ───────────────────────────────────────────────────────────
-- IMPORTANT: After creating the founder's Supabase Auth account via OTP,
-- set their auth_id here to link the profile row to the auth session.
-- Replace the placeholder UUID below with the real auth.users.id.
--
-- insert into users (id, auth_id, name, email, company_id, designation_id)
-- values (
--   gen_random_uuid(),
--   '<REPLACE_WITH_FOUNDER_AUTH_UID>',
--   'Ankur Hora',
--   'ankur@example.com',          -- replace with real email
--   '00000000-0000-0000-0000-000000000001',  -- Ecoste
--   '00000000-0000-0000-0002-000000000001'   -- Founder (leadership tier)
-- );
--
-- Uncomment and run after the founder logs in for the first time.
