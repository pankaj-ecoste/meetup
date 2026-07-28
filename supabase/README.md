# Database

MeetUp runs on **Supabase** (Postgres + Auth + Storage + Realtime). Everything the database needs is in this folder.

```
supabase/
├── setup.sql       ← run THIS on a fresh database. One file, does everything.
└── migrations/     ← history (0001–0018). Only for upgrading an existing database.
```

---

## Setting up a fresh database

Do this once, on a brand-new Supabase project.

### 1. Run the schema

Supabase dashboard → **SQL Editor** → **New query** → paste the whole of **`setup.sql`** → **Run**.

That single file creates:

| | |
|---|---|
| **8 tables** | `companies`, `designations`, `users`, `tasks`, `task_extensions`, `meetings`, `ideas`, `recording_jobs` |
| **2 views** | `user_performance` (derived scores), `leadership_task_register` (org-wide task metadata) |
| **RLS** | enabled with policies on every table |
| **Trigger** | `updated_at` auto-maintained on `tasks` and `recording_jobs` |
| **Indexes** | on every foreign key and list-view filter — sized for 200–300 users |
| **Storage** | the private `audio` bucket for recordings |
| **Seed rows** | 3 companies · 2 designations |

It is safe to re-run — every statement is idempotent.

### 2. Check the seed data landed

| Table | Expect |
|---|---|
| `companies` | `1001` Ecoste · `1002` Lamora · `1003` Metamask |
| `designations` | `'00'` CEO (`leadership`) · `'01'` Employee (`standard`) |

These IDs are small and human-readable on purpose — you will type them by hand when creating the first user.

### 3. Turn on Realtime

Dashboard → **Database → Replication** → enable replication for **`recording_jobs`** and **`tasks`**.

Without this the recording screen never leaves "Analysing…" and the dashboard counters do not update live.

### 4. Create the first (leadership) user

There is **no self-signup** — that is deliberate, so nobody can grant themselves CEO access. The first account has to be created by hand; after that, that person adds everyone else through the in-app admin screen at `/admin/employees`.

**a.** Dashboard → **Authentication → Users → Add user** → create the account with the founder's email.

**b.** Copy that user's UUID, then run in the SQL Editor:

```sql
insert into users (id, auth_id, name, email, company_id, designation_id, is_active, password_set)
values (
  gen_random_uuid(),
  '<PASTE_THE_AUTH_UUID_HERE>',
  'Founder Name',
  'founder@yourcompany.com',   -- must match the auth account's email exactly
  1001,                        -- 1001 Ecoste / 1002 Lamora / 1003 Metamask
  '00',                        -- '00' = CEO (leadership) / '01' = Employee
  true,
  false                        -- false = they still set their password at /claim
);
```

**c.** That person visits **`/claim`** in the app, finds their name, receives a one-time code by email, and sets a password. Every login after that is just email + password.

### 5. Set up email

The one-time code in step 4c goes out through Supabase Auth's email. Supabase's built-in sender is rate-limited and unreliable past a handful of users, so configure your own SMTP:

Dashboard → **Authentication → SMTP Settings** → enable custom SMTP.

Also set **Authentication → URL Configuration → Site URL** to your real deployed URL, not `localhost`.

> ⚠️ The email template for this flow must send the **code** (`{{ .Token }}`), not a magic link. A link-based template will break `/claim`.

---

## Upgrading a database that already exists

Use `migrations/`, not `setup.sql`.

Run only the numbered files newer than what your database already has, **in order**, one at a time, in the SQL Editor.

```
0001_companies.sql                              base tables
0002_designations.sql
0003_users.sql
0004_tasks.sql
0005_task_extensions.sql                        deadline renegotiation
0006_meetings.sql
0007_ideas.sql
0008_tasks_meeting_id_fk.sql                    FK added separately (dependency order)
0009_updated_at_trigger.sql
0010_user_performance_view.sql                  derived scoring
0011_recording_jobs.sql                         pipeline job queue
0012_audio_storage_bucket.sql                   private `audio` bucket
0013_performance_indexes.sql                    FK + list-view indexes
0014_recording_jobs_transcript_id.sql           links the AssemblyAI callback to a job
0015_users_password_set_claim_flag.sql          claim-once + password login
0016_company_code_and_ceo_designation.sql       collapse to 2 global designations
0017_small_ids_for_companies_and_designations.sql   companies.id -> 1001/1002/1003,
                                                    designations.id -> '00'/'01'
0018_leadership_task_register_view.sql          org-wide register (no task descriptions)
```

**Read `0017` before running it.** It re-keys the primary keys of `companies` and `designations` and rebuilds every foreign key, index, RLS policy and view that depends on them. It runs inside a transaction, so it either fully succeeds or fully rolls back — but take a backup first.

---

## Notes worth knowing

**Migrations 0016 and 0017 partly undo 0002.** The design changed mid-build: per-company designations were collapsed into two global ones, and UUID keys on the two lookup tables were replaced with small readable IDs. `setup.sql` walks the same path end to end and lands on the correct final schema, which is why a fresh install should use it rather than reading the migrations for the current design.

**RLS is not the only line of defence.** The app's API routes use the Supabase **service-role** key, which bypasses RLS by design — so every route handler verifies the caller itself (`requireUser()`) and scopes its own query. RLS is the second line of defence, not the first. Any new route handler must call `requireUser()`.

**`leadership_task_register` never selects `description`.** Leadership sees task *metadata* — who, for whom, when due, done or not — but not task content. That privacy rule is enforced by the view's shape, not by filtering after the fact. Do not add `description` to it.
