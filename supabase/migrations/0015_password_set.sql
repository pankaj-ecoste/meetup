-- 0015: move from OTP-every-login to a one-time claim + password login.
-- password_set tracks whether a person has finished the one-time "claim your
-- account" flow (OTP verify -> set password). Drives the /claim dropdown
-- (is_active AND NOT password_set) and lets already-linked accounts (e.g. the
-- founder, onboarded before this migration) go through the same one-time
-- claim to set a password, without re-touching auth_id.
alter table users add column if not exists password_set boolean not null default false;

create index if not exists idx_users_claimable on users (is_active, password_set);
