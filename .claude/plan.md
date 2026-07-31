# MeetUp — `plan.md`

> **Internal Operations Platform · Founder's Office**
> Voice-first capture for tasks, meeting outcomes, and ideas across **Ecoste** (WPC building products), **Lamora** (door solutions), and **Metamask** (metal facade systems).
>
> **Current release: `v1.0` — MVP. Built, deployed, live.**
> **Owner:** pankaj_ecoste (ai.support@ecoste.in)
> **Repo:** `github.com/pankaj-ecoste/meetup` · branch `main`
> **Live on:** Vercel (production) + Supabase project `nydmbszpzygkqutoyzkn`
> **Last updated:** 2026-07-28

---

## 0. How we work — read this first

**`plan.md` is written before code, not after.**

This is the single source of truth for MeetUp. There is no separate spec, tracker, or done-list. Every session follows the same order:

```
1. Decide what we're building
2. Write it into plan.md  ← under §8 "Planned work", using the template there
3. Then build it
4. When it ships, move that entry up into §2–§7 as part of the release,
   mark it ✅, and bump the version in §1
```

Nothing gets built that isn't written down here first. If a change is worth making, it's worth one paragraph in this file — that paragraph is what stops us re-deciding the same thing three weeks later.

Everything in **§2 through §7 describes `v1.0` — code that exists in the repo today.** Everything in **§8 is not built yet.**

---

## 1. Release status

| Release | Scope | State |
|---|---|---|
| **`v1.0` — MVP** | Voice capture (task / meeting / idea) → AI extraction → human confirm → routed record. Plus task views, scoring, deadline extensions, leadership dashboard, admin UI. | ✅ **Shipped & live** |
| `v1.1` | Overdue transitions, email/domain completion, ideas feed, CI, key rotation, device testing | ⬜ Planned — §8 |
| `v2` | WhatsApp notifications, calendar, Drive export, self-signup | ⬜ Future — §9 |
| `v3` | AI follow-up calling | ⬜ Future — §9 |

**Between v1.0 and v1.1 sits one non-code task: the pilot.** The app is verified as *working*; it has never been measured as *accurate* on real speech. That measurement (§8.9) is the gate — see the reasoning in §7.4.

---

## 2. What v1.0 is

Three actions on the home screen: **delegate a task**, **record a meeting**, or **store an idea**. A person taps a button, speaks in Hindi / English / Hinglish, and the system transcribes it, structures it, shows it back for confirmation, and routes it to the right people.

It is not a project-management tool. It is a **voice-first capture layer** that turns spoken intent into a structured, searchable, accountable record — for every employee, not just leadership.

### Everything shipped in v1.0

| Area | What was built | |
|---|---|---|
| Architecture | Fully serverless — Vercel + Supabase, one Next.js app, no always-on server, no CORS | ✅ |
| API | 25 Next.js Route Handlers under `app/api` — this is the backend | ✅ |
| Database | 8 tables, 2 views, 18 migrations, RLS on every table, indexes sized for 200–300 users | ✅ |
| Auth | One-time account claim (OTP once) + email/password login thereafter | ✅ |
| Recording pipeline | Submit + webhook, idempotent, audio stored before processing, verified end-to-end on production | ✅ |
| AI extraction | Claude `claude-opus-4-8`, three prompts, strict JSON, IST-aware relative deadlines | ✅ |
| Task delegation | Record **or** type manually → review form → save | ✅ |
| Meeting recording | MoM + N tasks extracted together, reviewed as a batch, saved as linked rows | ✅ |
| Idea capture | Record **or** type manually | ✅ |
| Task views | Tasks Received · Tasks Allocated · Meetings · Meeting detail — search + pagination | ✅ |
| Scoring | My Performance — on-time %, overdue count, totals, avg days, extension history | ✅ |
| Extensions | Request → approve/deny, full audit trail; an approved extension protects the score | ✅ |
| Leadership dashboard | Org-wide task register + date filters, today snapshot, 🟢🟡🔴 score bands — server-gated | ✅ |
| Admin UI | Employee roster + add employee, leadership-gated | ✅ |
| Mobile layout | Desktop sidebar, mobile top bar + slide-out menu, 5-item bottom nav | ✅ |

### Principles the v1.0 code enforces

| | | |
|---|---|---|
| 1 | A person is always a foreign key to `users.id` — never a copied name string | ✅ |
| 2 | Scores are derived from a Postgres view, never stored as a column | ✅ |
| 3 | No autonomous actions — every record is confirmed by the human who hits submit | ✅ |
| 4 | Leadership is a `capability_tier`, not a typed job title; no self-service path grants it | ✅ |
| 5 | Audio is stored before processing begins — a recording is never lost to a pipeline failure | ✅ |
| 6 | Every recording ends in a result or a clear error — never an infinite spinner | ✅ |
| 7 | Accuracy > Reliability > Speed when they conflict | ✅ |

---

## 3. How v1.0 is put together

```
Browser (Next.js pages, anon key)
   │
   ├─ page loads ────────────► proxy.ts → Supabase cookie session → redirect /login if none
   │
   ├─ data calls ────────────► /api/*  (Next.js Route Handlers, same origin)
   │                              │  Bearer JWT → requireUser() → service-role Supabase client
   │                              ▼
   │                          Supabase Postgres (8 tables + 2 views)
   │
   └─ live updates ──────────► Supabase Realtime (recording_jobs, tasks)

Recording:
   upload ─► Supabase Storage (private `audio`) ─► signed URL ─► AssemblyAI (webhook)
                                                                      │
                              webhook ◄──────────────────────────────┘
                                 └─► Claude extraction ─► recording_jobs.result ─► Realtime ─► UI
```

| | |
|---|---|
| UI and backend are **one Next.js app at the repo root**, same origin — **no CORS anywhere** | ✅ |
| Route Handlers run on the **Node runtime** (`export const runtime = 'nodejs'`) — required by the Supabase service-role SDK and the Anthropic SDK | ✅ |
| Security is **app-enforced in every handler**: the service-role key bypasses RLS, so each handler calls `requireUser(req)` and scopes the query itself. RLS stays enabled on every table as the second line of defence | ✅ |
| The service-role key **never reaches the browser** — all server modules live in `lib/server/` and import `'server-only'`, so the build fails if a client component imports one | ✅ |

### Stack

| Layer | What | Detail |
|---|---|---|
| App | Next.js App Router + React + Tailwind + TypeScript | `next@16.2.9`, `react@19.2.4`, Tailwind 4, TS 5 |
| Hosting | **Vercel** | one project, one deploy, production + previews |
| DB / Auth / Storage / Realtime | **Supabase** | project `nydmbszpzygkqutoyzkn`, owned by ai.support@ecoste.in |
| Transcription | **AssemblyAI** | REST via `fetch`; submit-with-webhook; `language_detection: true`, `speaker_labels: true` |
| AI extraction | **Claude API only** | `@anthropic-ai/sdk`, model **`claude-opus-4-8`**. No OpenAI in the stack |
| Email | **Mailjet SMTP** in Supabase Auth | carries the one-time claim OTP |

> **Next.js note:** `AGENTS.md` flags that this Next.js version has breaking changes vs. common training data — **read `node_modules/next/dist/docs/` before writing any route handler or convention-based file.** This is why the middleware file is `proxy.ts`.

### Folder structure

**The repo root *is* the app.** There is no `frontend/` folder — the name would be wrong, because `app/api/**` and `lib/server/*` are backend code that never reaches the browser. One Next.js project, one deploy.

```
meetup/                               ← repo root = the app (Vercel Root Directory = .)
│
├── .claude/
│   └── plan.md                       ← this file — spec, as-built state, and planned work
├── README.md                         ← clone-and-run guide + the 🌐/🔒 split
├── .env.example                      ← committed template; every key explained
├── .env.local                        ← the real keys, git-ignored (§7.1)
├── .gitignore
├── AGENTS.md / CLAUDE.md             ← read the local Next.js docs before coding
├── package.json · package-lock.json
├── proxy.ts                          ← session refresh + page auth guard
├── next.config.ts · tsconfig.json · eslint.config.mjs · postcss.config.mjs
│
├── supabase/
│   ├── README.md                     ← fresh setup vs. upgrading an existing DB
│   ├── setup.sql                     ← ⭐ THE script for a fresh database:
│   │                                    8 tables + 2 views + RLS + trigger +
│   │                                    indexes + audio bucket + seeds, idempotent
│   └── migrations/                   ← history (0001 → 0018); only for upgrading
│       ├── 0001_companies.sql
│       ├── 0002_designations.sql
│       ├── 0003_users.sql
│       ├── 0004_tasks.sql
│       ├── 0005_task_extensions.sql
│       ├── 0006_meetings.sql
│       ├── 0007_ideas.sql
│       ├── 0008_tasks_meeting_id_fk.sql
│       ├── 0009_updated_at_trigger.sql
│       ├── 0010_user_performance_view.sql
│       ├── 0011_recording_jobs.sql
│       ├── 0012_audio_storage_bucket.sql
│       ├── 0013_performance_indexes.sql
│       ├── 0014_recording_jobs_transcript_id.sql
│       ├── 0015_users_password_set_claim_flag.sql
│       ├── 0016_company_code_and_ceo_designation.sql
│       ├── 0017_small_ids_for_companies_and_designations.sql
│       └── 0018_leadership_task_register_view.sql
│
├── app/                              ← ⚠️ BOTH kinds of code live here — see the split below
│   ├── layout.tsx · globals.css · favicon.ico
│   ├── login/page.tsx                ← email + password sign-in
│   ├── claim/page.tsx                ← one-time claim: pick → OTP → set password
│   ├── auth/callback/route.ts        ← Supabase auth code exchange
│   │
│   ├── (app)/                        ← 🌐 RUNS IN THE BROWSER — authenticated shell
│   │   ├── layout.tsx                     (layout does the server auth check)
│   │   ├── page.tsx                  ← Dashboard: 4 live count cards (Realtime) + quick actions
│   │   ├── delegate/page.tsx         ← Task delegation — record OR type manually
│   │   ├── meeting/page.tsx          ← Meeting recording → MoM + N tasks, batch review
│   │   ├── idea/page.tsx             ← Idea capture — record OR type manually + recent ideas
│   │   ├── received/page.tsx         ← Tasks Received — search + pagination
│   │   ├── allocated/page.tsx        ← Tasks Allocated — search + pagination + extension decide
│   │   ├── meetings/page.tsx         ← Past meetings list
│   │   ├── meetings/[id]/page.tsx    ← MoM + generated tasks + raw transcript
│   │   ├── performance/page.tsx      ← My Performance — on-time %, overdue, extension history
│   │   ├── org-performance/page.tsx  ← LEADERSHIP: full CEO dashboard
│   │   └── admin/employees/page.tsx  ← LEADERSHIP: roster + add employee
│   │
│   └── api/                          ← 🔒 THE BACKEND — 25 Route Handlers, server only,
│       │                                never sent to the browser
│       ├── auth/me · auth/claim · auth/pending · auth/pending/email
│       ├── users
│       ├── tasks · tasks/dashboard · tasks/received · tasks/allocated · tasks/[id]/complete
│       ├── meetings · meetings/[id] · meetings/batch
│       ├── ideas
│       ├── extensions · extensions/[id]/decide
│       ├── performance/me · performance/org · performance/extensions/my
│       ├── leadership/today · leadership/tasks
│       ├── admin/employees
│       └── recordings/upload · recordings/webhook · recordings/jobs/[id]
│
├── components/                       ← 🌐 RUNS IN THE BROWSER
│   ├── Nav.tsx                       ← desktop sidebar + mobile top bar + bottom nav; leadership items conditional
│   ├── RecordButton.tsx              ← record/stop, waveform, timer, WebM(Chrome)/MP4(Safari) detect
│   ├── ProcessingSteps.tsx           ← staged progress: uploading → transcribing → analysing
│   ├── ReviewForm.tsx                ← auto-filled confirm form; searchable user dropdowns; missing-field gate
│   ├── TaskCard.tsx                  ← status colours, complete, request/approve extension
│   ├── ExtensionModal.tsx            ← doer raises: reason + proposed deadline
│   ├── ScoreCard.tsx                 ← metric tile
│   └── leadership/
│       ├── TodayTiles.tsx            ← assigned / completed / pending today
│       ├── ScoreBands.tsx            ← 🟢🟡🔴 bands, click to expand staff list
│       └── TaskRegister.tsx          ← org-wide task register + date filters + email search
│
├── lib/
│   ├── api.ts                        ← 🌐 all browser→/api calls (BASE = '/api')
│   ├── types.ts                      ← shared TypeScript types
│   ├── useRecordingJob.ts            ← 🌐 Realtime subscription + 6s poll fallback; stage machine
│   ├── supabase/client.ts            ← 🌐 browser client (ANON key only)
│   ├── supabase/server.ts            ← 🔒 server component client (anon key + cookies)
│   └── server/                       ← 🔒 SERVER ONLY — every file imports 'server-only',
│       │                                so the build FAILS if browser code imports it
│       ├── supabaseAdmin.ts          ← service-role client (bypasses RLS — never ships to browser)
│       ├── auth.ts                   ← requireUser() / requireAuthIdentity() / HttpError
│       ├── claude.ts                 ← 3 extraction prompts + IST now-context
│       ├── assemblyai.ts             ← submit-with-webhook + timing-safe secret verify + fetch transcript
│       ├── tasks.ts                  ← shared task select + join flattening
│       ├── istDate.ts                ← IST day-boundary helpers for leadership date filters
│       └── http.ts                   ← jsonError() — renders HttpError as JSON
│
└── public/
```

### 🌐 browser vs 🔒 server — the split that matters

Both live in one project, but Next.js ships them to different places:

| Marker | Where it runs | Who can read it |
|---|---|---|
| 🌐 | The user's browser | Anyone — assume it is fully public and editable |
| 🔒 | Vercel's servers | Nobody but us — never included in the browser bundle |

Three mechanisms keep the wall up: files under `app/api/**` are never bundled for the browser; every file in `lib/server/` imports `'server-only'` so the **build fails** if client code imports it; and only env vars prefixed `NEXT_PUBLIC_` are baked into browser JS — which is why `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` and `ASSEMBLYAI_API_KEY` have no prefix and never leave the server.

**The security rule that follows from this:** the browser decides what is *shown*; the server decides what is *allowed*. A user can edit the browser code to unhide the leadership menu — and gets nothing, because `/api/leadership/*` re-checks their `capability_tier` in the database on every request and returns 403.

---

## 4. Screens in v1.0

| Route | What it does | |
|---|---|---|
| `/login` | Email + password sign-in | ✅ |
| `/claim` | One-time account claim — pick your name, OTP to your email, set password | ✅ |
| `/` | Dashboard — 4 live count cards (given-open, received, completed, overdue) via Realtime + quick actions | ✅ |
| `/delegate` | Record one task, or type it in manually | ✅ |
| `/meeting` | Record a meeting → MoM + N tasks, reviewed together, submitted as a batch | ✅ |
| `/idea` | Record an idea, or type it in manually; recent ideas listed inline | ✅ |
| `/received` | Tasks assigned to me — search, pagination, `direct`/`from meeting` tag, complete, request extension | ✅ |
| `/allocated` | Tasks I assigned — search, pagination, pending-extension badge, approve/deny | ✅ |
| `/meetings` | Past meetings with MoM summary + task count | ✅ |
| `/meetings/[id]` | Full minutes + tasks generated + raw transcript | ✅ |
| `/performance` | My Performance — on-time %, overdue count, totals, avg days, extension history | ✅ |
| `/org-performance` | **Leadership only** — task register, today snapshot, score bands | ✅ |
| `/admin/employees` | **Leadership only** — employee roster + add employee | ✅ |

Leadership items appear in the nav only when `capability_tier === 'leadership'`.

---

## 5. The data model in v1.0

**8 tables + 2 views.** `companies` and `designations` use small human-readable IDs; everything else is UUID.

### `companies` — 3 rows ✅
| Column | Type | Notes |
|---|---|---|
| `id` | **smallint PK** | **1001 = Ecoste · 1002 = Lamora · 1003 = Metamask** |
| `name` | text | |

### `designations` — 2 global rows ✅
| Column | Type | Notes |
|---|---|---|
| `id` | **text PK** | **`'00'` = CEO · `'01'` = Employee** |
| `name` | text | `CEO` / `Employee` |
| `capability_tier` | text | `leadership` (CEO) / `standard` (Employee) |

Designations are **global** — no `company_id` on this table. A CEO can delegate to anyone in any of the three companies and sees the full cross-org dashboard.

### `users` ✅
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `auth_id` | uuid unique → `auth.users` | **null until the person claims their account** |
| `name` · `email` (unique) · `phone` | text | |
| `is_active` | boolean | soft delete — never hard-delete a user |
| `password_set` | boolean | **false until claimed**; drives the `/claim` list |
| `company_id` | smallint → companies | |
| `designation_id` | text → designations | |
| `created_at` | timestamptz | |

### `tasks` ✅
`id` · `source` (`task_delegation`\|`meeting`) · `meeting_id` (nullable) · `assignor_id` · `assignee_id` · `description` · `deadline` (current) · `original_deadline` (set at creation, never changed) · `report_to_id` · `status` (`open`\|`completed`\|`overdue`) · `completed_at` · `completion_note` · `created_at` · `updated_at` (trigger).

### `task_extensions` ✅
`id` · `task_id` · `requested_by` · `reason` · `proposed_deadline` · `status` (`requested`\|`approved`\|`denied`) · `decided_by` · `decided_at` · `created_at`.

### `meetings` ✅
`id` · `recorded_by` · `company_id` (smallint) · `transcript` · `audio_url` · `mom_summary` · `created_at`.

### `ideas` ✅
`id` · `recorded_by` · `summary` · `tags text[]` · `created_at`.

### `recording_jobs` ✅
`id` · `user_id` · `job_type` (`task_delegation`\|`meeting`\|`idea`) · `audio_url` · `transcript_id` (AssemblyAI id) · `status` (**`pending` → `transcribing` → `extracting` → `done` \| `error`**) · `transcript` · `result jsonb` · `error_msg` · `created_at` · `updated_at`.

### Views ✅
- **`user_performance`** — per user: `total_tasks`, `completed_tasks`, `on_time_tasks`, `on_time_pct`, `overdue_count`, `avg_days_to_complete`.
- **`leadership_task_register`** — flat row per task, all companies, joined to assignor / assignee / company. **`description` is never selected in the view** — the privacy rule is enforced structurally, not by filtering downstream.

### RLS ✅
Enabled on every table. Users read only their own scoped rows (`tasks` readable by assignee or assignor; `recording_jobs` by owner). The `users_update_own` policy blocks a user from pointing their own `designation_id` at a leadership-tier designation.

---

## 6. How v1.0 works, flow by flow

### 6.1 Auth ✅

**One-time claim** — `/claim`:

| Step | | |
|---|---|---|
| 1 | Pick your name from a searchable list of unclaimed profiles — `GET /api/auth/pending` returns rows where `is_active AND NOT password_set` | ✅ |
| 2 | `POST /api/auth/pending/email` resolves that profile's email on file; the browser calls `supabase.auth.signInWithOtp` | ✅ |
| 3 | `supabase.auth.verifyOtp` creates a session; `supabase.auth.updateUser({ password })` sets the password | ✅ |
| 4 | `POST /api/auth/claim` checks the signed-in email matches the profile's email on file, then sets `auth_id` + `password_set = true`. Idempotent; refuses if the profile is already linked to a different auth account | ✅ |

**Every login after that** — `/login`: `signInWithPassword`. No email round-trip. OTP is used exactly once per person, at claim time.

**Guards:** `proxy.ts` validates the page session with `getUser()` (not `getSession()`) and redirects to `/login`; public paths are `/login` and `/claim`; `/api/*` is excluded because API routes do their own Bearer-token auth via `requireUser(req)`.

### 6.2 Recording pipeline ✅

**Submit + webhook.** Nothing on our side sits open waiting for AssemblyAI.

| Step | | |
|---|---|---|
| 1 | **`POST /api/recordings/upload`** (user-authed, returns in ~1–2s): validate `job_type` → upload the audio Blob to the **private `audio` bucket** at `{user_id}/{uuid}.{ext}` → create a 1-hour signed URL → insert the `recording_jobs` row → submit to AssemblyAI `POST /v2/transcript` with `language_detection`, `speaker_labels`, `webhook_url` and a secret auth header → save `transcript_id` → flip to `transcribing`. **Audio is stored before anything else can fail.** A failed submit marks the job `error`, so the user always gets an outcome | ✅ |
| 2 | The webhook URL is derived from the **incoming request's own origin** (`x-forwarded-proto` / `x-forwarded-host`) — automatically correct on production, previews and custom domains. `SITE_URL` is an optional override only | ✅ |
| 3 | AssemblyAI transcribes **on its own servers**, then POSTs our webhook | ✅ |
| 4 | **`POST /api/recordings/webhook`** — **not** user-authed; authenticated by the AssemblyAI secret header compared with `timingSafeEqual`. Finds the job by `transcript_id`. **Idempotent**: a job already `done`/`error` is acked and skipped, so a duplicate callback never double-processes. Empty transcript → `error` with "No speech detected…". Otherwise: save transcript → `extracting` → run the Claude prompt for that `job_type` → write `result` → `done`. Any throw → `error` with the message | ✅ |
| 5 | The browser (`useRecordingJob.ts`) subscribes to Supabase **Realtime** on that job row, with a **6-second poll as a reliability net** if a Realtime event is ever dropped. Stages map to on-screen labels: uploading → queuing → transcribing → analysing → review | ✅ |

### 6.3 AI extraction ✅

Three system prompts, one client, strict JSON out, model **`claude-opus-4-8`**:

| Flow | Output shape | |
|---|---|---|
| Task | `{ doer_name, description, deadline, report_to_name }` | ✅ |
| Meeting | `{ mom_summary, tasks: [ { doer_name, description, deadline, report_to_name }, … ] }` | ✅ |
| Idea | `{ summary, tags: [...] }` | ✅ |

The task and meeting prompts carry an **IST now-context**: the current `Asia/Kolkata` datetime plus an instruction to resolve relative deadlines ("Friday", "Monday tak", "kal", "parso", "agle hafte", "shaam 5 baje") to absolute ISO datetimes and never emit a past date. IST is a fixed UTC+5:30, so a hardcoded offset is used — no tz database dependency. Thinking is left off: extraction is a simple structured-output call, and latency stays low.

### 6.4 Confirm before save ✅

Every flow lands on `ReviewForm`, pre-filled with Claude's output. Doer and Report-To are searchable dropdowns from `users` showing **Name + Company** — which is what disambiguates two people with the same name — pre-selected to Claude's best guess but always correctable. The four required fields (**Doer, Description, Deadline, Report To**) turn red and **lock the submit button** until filled. `original_deadline` is set equal to `deadline` at creation. A meeting saves each extracted task as its own row linked by `meeting_id`, reviewed together and submitted as one batch.

### 6.5 Manual entry ✅

Task delegation and idea capture both offer **"Or type it in manually"**, opening the same `ReviewForm` with an empty `result: {}` — every field blank, typed directly. Same validation, same submit path, no new component, no schema change. Meetings have no manual equivalent by design: the multi-task structure is exactly what recording + extraction is for.

### 6.6 Scoring & extensions ✅

- **On-time completion rate** = completed tasks where `completed_at <= deadline` ÷ completed tasks.
- **Current overdue count** = tasks with `status = 'overdue'`.
- Both read from the `user_performance` view. Nothing is stored on `users`.

The score judges against the **current** deadline. A doer raises a bottleneck → `POST /api/extensions` with a reason and proposed date → the assignor sees a badge on Tasks Allocated → `PATCH /api/extensions/{id}/decide`. **Approve** moves `tasks.deadline` (leaving `original_deadline` untouched) so there is no penalty; **deny** changes nothing. Protection comes from the extension being **approved**, not from claiming a bottleneck — that is what makes it ungameable — and `original_deadline` preserves the true first commitment for leadership.

### 6.7 Leadership dashboard ✅ — `/org-performance`

Every read crosses company boundaries, so each leadership endpoint re-checks the **server-verified** `capability_tier === 'leadership'` from `requireUser()` and returns **403** otherwise. The page also hides itself for non-leadership users — the UI is the convenience, the server check is the security.

| Part | Endpoint | What | |
|---|---|---|---|
| A. Task register | `GET /api/leadership/tasks` | Every task, all companies, any status: assigner · doer · deadline · assigned date · status. Filters: assigned-date range, deadline range, email search, 50/page. IST calendar days converted to UTC bounds via `istDate.ts`. **Description never shown** | ✅ |
| B. Today snapshot | `GET /api/leadership/today` | Assigned today · completed today · pending now, org-wide, on IST day boundaries | ✅ |
| C. Score bands | `GET /api/performance/org` | 🟢 ≥95% · 🟡 90–<95% · 🔴 <90%. Click a band to expand the staff in it; search by email | ✅ |

### 6.8 Admin ✅ — `/admin/employees`

`GET /api/admin/employees` returns the roster plus companies/designations lookups; `POST` adds an employee (`auth_id` null, `password_set` false) so they claim their account at `/claim`. Both verbs check the leadership tier. Duplicate email → 409.

**Why self-claiming CEO is impossible:** leadership is a `capability_tier` and never a typed title; the `users_update_own` RLS policy rejects any self-update pointing `designation_id` at a leadership designation; and the only way to create an employee is the leadership-gated admin endpoint. There is no self-signup path.

---

## 7. Running v1.0

### 7.1 Environment variables

All keys live in `.env.local` at the repo root (git-ignored) and in **Vercel project env vars** in production.

**Server-only (must NOT carry the `NEXT_PUBLIC_` prefix):**
- `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS; used only inside `lib/server/`
- `ANTHROPIC_API_KEY`
- `ASSEMBLYAI_API_KEY`
- `ASSEMBLYAI_WEBHOOK_SECRET` — the shared secret AssemblyAI echoes back on the callback
- `SITE_URL` — optional canonical-domain override for the webhook URL

**Public (browser):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

There is no `OPENAI_API_KEY` — Claude only.

### 7.2 Local dev

From the repo root:
```
npm run dev
```
That is the whole app — UI and API together. There is no second service to start and no folder to `cd` into.

**Caveat:** AssemblyAI cannot call `localhost`, so the **recording pipeline can only be tested on a deployed Vercel URL** (production or a preview). Every non-recording screen works locally.

### 7.3 Fresh database setup

Paste `supabase/setup.sql` into the Supabase SQL editor and run it once — 8 tables, both views, RLS on everything, the `updated_at` trigger, the indexes, the private `audio` bucket, and the company/designation seeds. Idempotent, so it is safe to re-run.

Then enable **Realtime** on `recording_jobs` and `tasks`, and create the first leadership user by hand — there is no self-signup. Full steps, including the first-user SQL and the email configuration, are in **`supabase/README.md`**.

Use `supabase/migrations/` **only** to upgrade a database that already holds an older schema — not for a fresh install.

### 7.4 What v1.0 has *not* proven

The pipeline is verified as **working** — audio in, structured record out, on production. It has **never been measured for accuracy** on real Hinglish speech from real employees. Deadline-parsing and doer-matching rates are unknown.

That measurement is the gate on everything after v1.0 (§8.9). It is deliberate: the system should not be trusted to notify or call 200–300 people until extraction is proven on a small supervised group. If the foundation is shaky, nothing built on top of it can be trusted.

---

## 8. Planned work — `v1.1` ⬜

> **This is where new work gets written before it gets built.** Add an entry here first, then code it. When it ships, move it into §2–§7, mark it ✅, and bump the version in §1.
>
> **Template for a new entry:**
> ```
> ### 8.x <Name> — HIGH | MEDIUM | LOW
> **What:** one sentence on what changes.
> **Why:** the problem it solves.
> **Where:** files / tables / endpoints it touches.
> **Done when:** the observable condition that proves it works.
> ```

### 8.0 Repo restructure — move the app to the repo root — ✅ **DONE 2026-07-28** (⚠️ one manual step left)
**What:** moved everything out of `frontend/` up to the repo root, so the repo root *is* the app. `frontend/` deleted.
**Why:** `frontend/` held **both the UI and the backend** — `app/api/**` and `lib/server/*` never reach the browser. The name misled about where server code lives. One deployable, so nothing left to split.
**Done:** 84 files moved with `git mv` (all recorded as renames, history preserved) · `.env.local` moved by hand, verified intact · the two `.gitignore` files merged into one at root, dead Python section and stale `backend/.env.example` comment dropped · stale `.next` + `tsconfig.tsbuildinfo` cleared · `npm install` reconciled · **`npm run build` compiles clean, all 25 API routes present.** Zero code changes — the `@/*` alias resolves to `./*` relative to the project root and nothing referenced `frontend/`.

> ### ⚠️ 8.0a Vercel Root Directory — **STILL TO DO, NOT IN GIT**
> **Vercel dashboard → Settings → Build & Development → Root Directory: change `frontend` → blank (`.`), then redeploy.**
> Until this is changed, **the next deploy will fail** — Vercel will look inside a `frontend/` folder that no longer exists. This cannot be done from the repo; it is a dashboard setting.
> **Done when:** a deploy goes green and the live site logs in and loads the dashboard.

### 8.0b Clone-and-run: tidy `supabase/`, real README, `.env.example` — ✅ **DONE 2026-07-28**
**What:** made a fresh `git clone` runnable by someone who has never seen the project.
**Why:** three gaps — `supabase/seed.sql` was **redundant and broken** (it seeded UUID company ids and 12 per-company designations, i.e. the schema as it was *before* 0016/0017 re-keyed it, so it would fail on a current database); `README.md` was untouched `create-next-app` boilerplate; and there was no `.env.example`, so a cloner could not know which keys were needed.
**Done:**
- **Deleted** `supabase/seed.sql` — superseded by `setup.sql`, recoverable from git history
- **Renamed** `run_all_migrations.sql` → **`setup.sql`**, and rewrote its header to state exactly what it creates and that it is idempotent
- **Renamed 5 vague migration filenames** to say what they do (`0013_indexes` → `0013_performance_indexes`, `0015_password_set` → `0015_users_password_set_claim_flag`, etc.)
- **New `supabase/README.md`** — fresh setup (schema → Realtime → first leadership user → email/SMTP) vs. upgrading an existing database, with the first-user SQL written out and a warning to read `0017` before running it
- **New `.env.example`** — every variable explained, where to get it, and which are public vs. server-only; plus a `!.env.example` exception in `.gitignore`, since the `.env.*` rule would otherwise hide it
- **Rewrote root `README.md`** — what MeetUp is, the 🌐/🔒 split and why it makes the app safe, 5-step local setup, deployment (including the Deployment Protection trap that silently kills recordings), and the four rules for anyone changing the code

### 8.1 Overdue status transition — **HIGH**
**What:** a scheduled job that flips `open` → `overdue` when `deadline < now()`, and `overdue` → `open` when an approved extension moves the deadline back into the future.
**Why:** **nothing in the codebase sets `status = 'overdue'` today.** No cron, no trigger, no route handler writes it. `TaskCard` computes `isDeadlinePast` for colour only; the DB row stays `open` forever — so `overdue_count` reads **0** on the Dashboard, on My Performance, and on the leadership Score Bands. Half the scoring layer currently reports nothing.
**Where:** Supabase `pg_cron`, or Vercel Cron hitting a new route handler; `tasks.status`; the approve branch of `PATCH /api/extensions/[id]/decide`.
**Done when:** a task past its deadline shows `overdue` in the DB, the dashboard count is non-zero, and approving an extension into the future returns it to `open`.

### 8.2 Supabase email + domain setup — **HIGH**
**What:** finish the three unfinished Mailjet/Supabase items.
**Why:** together they block a real employee from claiming an account from a cold inbox.
**Where:** Supabase Auth settings + the domain registrar.
- The **"Confirm signup" template still sends a link, not the OTP code** the `/claim` flow expects.
- **Site URL still points at localhost.**
- **Domain-auth DNS TXT records** not yet added.
**Done when:** a brand-new employee receives a 6-digit code and completes `/claim` end to end.

### 8.3 Ideas feed — MEDIUM
**What:** a standalone ideas view with company filter, date filter, and keyword search.
**Why:** recent ideas render inline on `/idea` only. Ideas go in but are hard to get back out.
**Where:** new `app/(app)/ideas/page.tsx`; extend `GET /api/ideas` with filter params; `tags` is a `text[]`, searchable with the `@>` operator.
**Done when:** any idea from any company can be found by tag, company, date, or keyword.

### 8.4 GitHub CI — MEDIUM
**What:** a workflow running lint + build on every push.
**Why:** nothing currently catches a broken push; checks only run on a developer's machine.
**Done when:** a PR with a type error fails before merge.

### 8.5 Service-role key rotation — MEDIUM
**What:** roll `SUPABASE_SERVICE_ROLE_KEY` and update Vercel + `.env.local`.
**Why:** the key was exposed in a chat transcript during setup.
**Done when:** the old key is invalid and production still works.

### 8.6 Real-device testing — MEDIUM
**What:** test on a real Android (Chrome) and a real iPhone (Safari), including iOS mic-permission persistence.
**Why:** the layout is responsive but has never run on physical hardware.
**Done when:** all three recording flows complete on both devices.

### 8.7 New-task in-app notification — LOW
**What:** toast + badge + light sound on the Dashboard when someone assigns you a task.
**Why:** a new task is currently silent until you go looking for it.
**Where:** rides the existing Realtime subscription on `tasks` — no new infrastructure.
**Done when:** assigning a task to a logged-in colleague visibly alerts them without a refresh.

### 8.8 Meeting-recording robustness — LOW
**What:** review behaviour for long meetings near the ~30-minute cap.
**Why:** untested at the upper bound; Vercel function duration and AssemblyAI turnaround both scale with length.
**Done when:** a 30-minute recording completes or fails with a clear message — never hangs.

### 8.9 🚪 THE PILOT — the gate on everything above and after
**What:** run v1.0 with 2–3 real people, daily, and measure extraction accuracy on real recordings.
**Why:** §7.4 — the app is proven to work, not proven to be right.

**Order of work:**
1. Fix **8.1** and **8.2** first — the pilot is meaningless without working overdue counts and a working claim email.
2. Seed pilot accounts (founder's office + 1–2 team leads) via `/admin/employees`; have each person claim at `/claim` from a cold inbox.
3. Use it daily for real work. No synthetic clips.
4. Measure accuracy. Agree the definition **before** starting: deadline parsed correctly **and** doer matched to the right user **and** description sensible.
5. Two full rounds of bug fixes from feedback.
6. Verify the leadership gate by hand — log in as a standard user and hit `/api/performance/org` and `/api/leadership/tasks` directly. Both must return **403 from the server**, not merely hide in the UI.
7. Decide the WhatsApp provider (Meta Cloud API / AiSensy / Twilio) and **submit templates to Meta** — approval takes 3–7 days and must not block v2.

**Targets:** deadline parsed correctly **90%+** · doer matched **85%+** · 2-min clip returns its result in **under ~30s**.

**Gate — v2 is blocked until every box passes:**
- [ ] Extraction accuracy above **90%** on real pilot recordings
- [ ] Schema stable — no structural changes needed after 2 weeks of real use
- [ ] Pilot users actively using the tool, **not reverting to WhatsApp**
- [ ] A standard-tier user is **rejected by the server** on every leadership endpoint
- [ ] Overdue status actually transitions, so overdue counts are real
- [ ] Works on a real Android and a real iPhone
- [ ] WhatsApp templates submitted to Meta

### 8.10 Meeting recording upgrade: speakers, multi-assignee, perfect MoM, sharing — HIGH
**What:** five changes to the meeting-recording flow, designed together in one conversation on 2026-07-30:
1. **Speaker tagging** — AssemblyAI is already called with `speaker_labels: true`, but the webhook only ever fetched the flat merged `text`, discarding the `utterances` array (per-utterance `speaker` + `text`). Fetch it, build a `Speaker A: … / Speaker B: …` transcript, and have Claude best-guess a real name per label from context (self-intro, being addressed) — never from voice, since AssemblyAI has no voiceprint ID. The reviewer confirms/corrects each guess via a small mapping UI (reusing the existing user-dropdown component) before saving; confirmed names get substituted into the saved transcript.
2. **Multi-assignee fan-out** — `doer_name` (string) → `doer_names` (string array) in the meeting-extraction output only. One utterance naming several people becomes several task-draft cards at review time (same description/deadline/report-to, different assignee each) — no schema change, since `tasks` is already one-row-per-assignee.
3. **The "perfect MoM"** — one Claude call produces the whole thing, so there is never a second "regenerate the summary" call:
   ```
   Date & Time: <auto-filled from the recording's timestamp>
   Attendees: <left blank — the recorder types names in on the review screen>

   Summary
   Key Discussion Points
   Decisions Made        (omitted if nothing was decided)
   Action Items          (omitted if the meeting produced zero tasks)
   Next Steps            (the CTA line)
   ```
   Plain text, bullets, sections omitted rather than left empty. This single string is what's shown behind the "full summary" button too — there is no separate long-form recap.
4. **Task add/remove in review** — `ReviewForm`'s meeting section had no way to add a task Claude missed or remove one it invented; add "+ Add task" and a per-card "Remove," independent of how many tasks (including zero) came out of extraction.
5. **MoM sharing** — a multi-select recipient picker (any user, not leadership-only) on the same review screen, working even for a MoM-only meeting with no tasks. One "Confirm & Save" saves the meeting, its tasks, and the share together. New `meeting_shares` table (`meeting_id`, `shared_with_user_id`, `shared_by`, `created_at`) with its own RLS policy; `meetings` SELECT RLS widened so a recipient can read a meeting shared to them. Recipients see these in a new "Shared with me" view, kept separate from meetings they recorded themselves.

**Why:** the meeting flow already runs diarization and throws the result away; a meeting with several speakers currently produces an MoM and task list with no sense of who said what, no way to delegate one task to a group, no way to fix a wrong extraction before saving, and no way to get the MoM in front of the one person (usually the CEO) who actually needs to see it without them separately opening `/meetings` and finding it themselves — which they can't, since meetings are recorder-only today.

**Where:** `supabase/migrations/0019_meeting_shares.sql` + `supabase/setup.sql`; `lib/types.ts`; `lib/server/assemblyai.ts`; `lib/server/claude.ts` (`MEETING_SYSTEM`); `app/api/recordings/webhook/route.ts`; `app/api/meetings/batch/route.ts`; `app/api/meetings/[id]/route.ts`; new `app/api/meetings/shared/route.ts`; `lib/api.ts`; `components/ReviewForm.tsx`; new `app/(app)/meetings/shared/page.tsx` + `components/Nav.tsx`; `app/(app)/meetings/[id]/page.tsx` (summary button).

**Done when:** a multi-speaker meeting recording produces a speaker-confirmable MoM in the format above; an utterance naming two people creates two task cards; the reviewer can add/remove a task card freely, including when zero were extracted; picking recipients and saving shares the MoM, and each recipient sees it under "Shared with me" without needing recorder access to the meeting; `npm run build` passes clean.

**Caveat carried over from §7.2:** the AssemblyAI webhook cannot reach `localhost`, so this can only be verified end-to-end on a deployed Vercel URL, not local dev.

### 8.11 Manager tier — company-scoped leadership — HIGH
**What:** a third `capability_tier`, `'manager'`, sitting between `standard` and `leadership`. A Manager (e.g. seeded as designation `'02' Manager`) delegates and sees scores/reports only within their own company, never cross-org.

**Why:** today access is binary — `leadership` (CEO) sees and delegates across all three companies, everyone else is `standard` and fully blocked from the org dashboard. There's no tier for a company lead (e.g. the Ecoste lead) who should see their own company's numbers without seeing Lamora's or Metamask's.

**Where:**
- `supabase/migrations/0020_manager_designation.sql` + `supabase/setup.sql` — drop and recreate the `designations.capability_tier` check constraint to allow `'manager'` alongside `'standard'`/`'leadership'`; insert designation row `'02' / Manager / capability_tier 'manager'`.
- `app/api/leadership/tasks/route.ts`, `app/api/leadership/today/route.ts`, `app/api/performance/org/route.ts` — gate becomes `leadership OR manager`, and a `manager` caller gets every query filtered to `company_id = caller.company_id` (the register and performance views already carry `company_id`; the "today" counts scope via an assignee-in-company lookup, since `tasks` itself has no `company_id` column).
- `components/Nav.tsx` — "Org Performance" visible to `manager` too; "Manage Employees" stays `leadership`-only (explicit decision — creating logins is more sensitive than viewing scores).
- `app/(app)/org-performance/page.tsx` — access gate widens to `leadership || manager`; header copy adapts to the caller's own company name when not full leadership.

**What needs no change (already generic):** the same-company delegation restriction (`/api/users` dropdown, `POST /api/tasks`, `POST /api/meetings/batch` all already gate on `capability_tier !== 'leadership'`, which already applies to `manager`); self-elevation protection (`users_update_own` RLS already blocks a user from self-assigning any non-`'standard'` designation, so it already blocks self-promotion to `manager`); seeding a Manager (the existing leadership-gated `/admin/employees` form already lists designations dynamically).

**Done when:** a user seeded with designation `Manager` at Ecoste can delegate only to Ecoste people, sees Org Performance (today snapshot, score bands, task register) containing only Ecoste rows, cannot see Lamora/Metamask data anywhere, and cannot open Manage Employees or self-promote their own designation.

### 8.12 Multi-task recording — HIGH
**What:** the "Record Task" flow moves from extracting a single flat task to extracting an array of tasks — same multi-assignee/add/remove pattern the meeting flow already has, applied to task delegation.

**Why:** a single task-delegation recording can name more than one task ("tell Rahul to finish the drawing by Friday, and ask Priya to send the vendor quote by Monday") with different descriptions, report-tos, and deadlines each — the current flow only ever captures one. The meeting flow already solved this exact shape (`ExtractedMeetingTask[]` with `doer_names[]`, add/remove cards, batch insert); task delegation becomes the same shape instead of a separate one-off.

**Where:**
- `lib/server/claude.ts` — `TASK_SYSTEM` rewritten to extract `{ tasks: [...] }`, reusing the `ExtractedMeetingTask` shape (`doer_names[]`, `description`, `deadline`, `report_to_name`) instead of one flat object.
- `lib/types.ts` — drop the single-task `ExtractedTask` type; task delegation now types its extraction result the same as a meeting's task array.
- New `app/api/tasks/batch/route.ts` — mirrors `POST /api/meetings/batch`'s task-insertion and same-company-restriction logic, minus the meeting/MoM/sharing parts. Inserts N rows with `source: 'task_delegation'`, `meeting_id: null`.
- `app/api/tasks/route.ts` (single-insert `POST`) and `lib/api.ts`'s `createTask` — retired; replaced by the batch endpoint so there's exactly one task-creation code path, not two.
- `components/ReviewForm.tsx` — the `task_delegation` branch switches from one `TaskDraftForm` to the same list-of-cards UI the `meeting` branch already has (fan out by `doer_names`, "+ Add task", per-card "Remove") — except Remove is disabled when exactly one card remains, since (unlike a MoM-only meeting) a task recording with zero tasks isn't meaningful. "Type it in manually" starts with one blank card instead of one blank flat form.
- `app/api/recordings/webhook/route.ts` — stores the new array-shaped result for `job_type: 'task_delegation'`, same as it already does for `meeting`.

**Done when:** a recording naming two people two different tasks with two different deadlines produces two reviewable, independently-editable task cards; the reviewer can add a card Claude missed or remove one it invented (down to a minimum of one); "type it in manually" starts at one blank card; `npm run build` passes clean.

---

## 9. Future releases ⬜

**`v2` — org-wide rollout & automation.** WhatsApp notifications (new task, 24h deadline reminder, overdue alert, completion, extension decisions); a **Pending Actions** screen where a human can edit or cancel any system-initiated message **before** it goes out — no autonomous sends, ever; Google Calendar events from meeting MoMs; MoM export to the `_BRAIN/MTG` Drive folder; a read-only Google Sheets mirror; bulk user seeding; self-signup with leadership designations excluded from the dropdown and rejected server-side. **No PII in WhatsApp** — messages stay generic ("You have a new task — open MeetUp to view") and deep-link into the app.

**`v3` — AI calling.** VAPI.ai follow-up calls on overdue tasks, **always** routed through the same Pending Actions approval screen. Call transcripts stored in Supabase for audit. Leadership tier only.

---

## 10. Locked decisions

These do not get re-litigated. If one needs to change, write the change into §8 first.

| Decision | Answer |
|---|---|
| Hosting | **Vercel + Supabase, fully serverless.** No always-on server. |
| Backend | **Next.js Route Handlers under `app/api`.** One repo, one deploy. |
| Repo layout | **The repo root is the app** — no `frontend/` folder, because the same project holds the backend. Vercel Root Directory = `.` |
| Which LLM | **Claude API only** (`claude-opus-4-8`). No OpenAI key anywhere — not in env, not in Vercel, not in code. |
| Transcription | AssemblyAI, submit-with-webhook, language detection on. |
| Auth | **One-time claim (OTP once) + email/password after.** |
| Company / designation IDs | Small human-readable IDs: companies `1001/1002/1003`, designations `'00'` (CEO) / `'01'` (Employee). Everything else stays UUID. |
| Designations | Exactly **two, global**: CEO (leadership) and Employee (standard). |
| Who is the assignor? | Always the logged-in user. No "on behalf of" mode. |
| Mandatory task fields | Doer, Description, Deadline, Report To. Submit locked until all four are filled. |
| What the dropdown shows | Name + Company — that's what disambiguates same-name people. |
| Who sees ideas? | All employees, all companies. |
| Who sees all scores? | Only `capability_tier = 'leadership'`, verified server-side on every leadership endpoint. |
| What leadership sees in the register | **Metadata only** — assigner, doer, deadline, assigned date, status. Task description is deliberately hidden and the view never selects it. |
| How leadership access is granted | Seeding or the leadership-gated admin endpoint only. Never self-service. RLS blocks self-elevation. |
| How a doer is scored | Derived live from `tasks`, never stored. On-time % + current overdue count. |
| What protects a score | An **approved** extension, not a claimed one. It moves `deadline`; `original_deadline` never changes. |
| Where audio lives | Private Supabase Storage `audio` bucket, signed URLs only. Never public. |
| When someone leaves | `is_active = false`. Never hard-delete — their tasks stay intact. |
| Max recording length | ~5 min for task delegation, ~30 min for meetings; enforced in the UI. |
| Priority when objectives conflict | **Accurate > Reliable > Fast.** |

---

## 11. Glossary

- **MVP / v1.0** — the release described in §2–§7: voice capture → AI extraction → human confirm → routed record, plus views, scoring, extensions, leadership dashboard and admin.
- **MoM** — Minutes of Meeting; Claude's structured summary of a recorded meeting.
- **Doer / assignee** — the person responsible for completing a task.
- **Assignor** — the person who created the task (always the logged-in recorder).
- **Report To** — the person the doer reports completion to.
- **Hinglish** — the natural Hindi/English code-mix the organisation actually speaks.
- **RLS** — Row-Level Security; access rules enforced inside Postgres.
- **`capability_tier`** — the field on `designations` that gates feature access (`standard` / `leadership`).
- **Claim** — the one-time flow where a seeded employee proves their email via OTP and sets a password, linking `auth_id` and setting `password_set = true`.
- **Derived score** — performance computed live from `tasks`, never stored as a column.
- **Approved extension** — a deadline change approved by the assignor; the only thing that protects a doer's score.
- **Gate** — a checkpoint that fully blocks the next release until every criterion passes.
