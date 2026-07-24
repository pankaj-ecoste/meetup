# MeetUp — Build Tracker

> **Single source of progress.** Update this file after every build session.
> For requirements and architecture, refer to `plan.md`.
> Last updated: 2026-06-23 — Session 2 closed: frontend complete (auth + all pages + components); needs real recording test

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Done — built, tested, verified |
| 🔄 | In Progress — currently being built |
| ⏳ | Pending — queued, not started |
| 🔒 | Blocked — waiting on a gate above it |
| ❌ | Skipped — explicitly deferred |

---

## Phase 0 — Project Setup (Week 1)

**Gate status: 🔄 IN PROGRESS — backend written; Supabase + frontend pending**

### Build tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 0.1 | Pipeline modules written from scratch (no CoachUp clone) | ✅ | `services/assemblyai.py`, `services/extraction.py` — extraction.py now on **Claude API** (`claude-opus-4-8`); OpenAI removed (Tech Debt #4 resolved) |
| 0.2 | Migration: `companies` table | ✅ | `0001_companies.sql` — RLS included |
| 0.3 | Migration: `designations` table (with `capability_tier`) | ✅ | `0002_designations.sql` |
| 0.4 | Migration: `users` table | ✅ | `0003_users.sql` — RLS blocks self-elevation to leadership tier |
| 0.5 | Migration: `tasks` table (with `completed_at` + `original_deadline`) | ✅ | `0004_tasks.sql` |
| 0.6 | Migration: `task_extensions` table | ✅ | `0005_task_extensions.sql` |
| 0.7 | Migration: `meetings` table | ✅ | `0006_meetings.sql` |
| 0.8 | Migration: `ideas` table | ✅ | `0007_ideas.sql` |
| 0.9 | FK: `tasks.meeting_id → meetings.id` (separate migration; dependency order fix) | ✅ | `0008_fk_task_meeting.sql` |
| 0.10 | RLS enabled on all 7 tables | ✅ | Included in each table's migration |
| 0.11 | Add `updated_at` Postgres trigger on `tasks` + `recording_jobs` | ✅ | `0009_updated_at_trigger.sql` |
| 0.12 | Create `user_performance` Postgres view | ✅ | `0010_user_performance_view.sql` — security enforced in FastAPI, not view |
| 0.13 | Migration: `recording_jobs` table (async pipeline queue) | ✅ | `0011_recording_jobs.sql` |
| 0.14 | Seed script: companies + designations + founder account template | ✅ | `supabase/seed.sql` — founder insert commented, run after first OTP login |
| 0.15 | FastAPI backend scaffold (all 7 routers + 3 services + Pydantic models) | ✅ | `backend/` — see file list below |
| 0.16 | Railway deploy config | ✅ | `railway.toml` |
| 0.17 | Run migrations in Supabase | ✅ | All 8 tables + view + trigger created; run one by one in SQL editor |
| 0.18 | Run seed.sql in Supabase | ✅ | Companies (Ecoste/Lamora/Metamask) + all designations seeded |
| 0.19 | `.env` created with all real keys | ✅ | Supabase URL + service role key + OpenAI key + AssemblyAI key all filled in |
| 0.19b | Create `audio` storage bucket in Supabase (private) | ✅ | Required for recording uploads |
| 0.20 | Scaffold Next.js + Tailwind frontend | ✅ | Next.js 16 + Tailwind 4 + TypeScript in `frontend/` |
| 0.21 | Supabase Auth: email + OTP — wire into frontend | ✅ | `app/login/page.tsx` — two-step email → OTP; `proxy.ts` session refresh; anon key only in frontend |
| 0.22 | Wire GitHub CI — lint + build pass on every push | ⏳ | **Deferred** |

### Exit gate checklist (all must pass before Phase 1A starts)

- [ ] Engineer can log in via OTP
- [ ] All 7 tables exist with RLS enabled and correct foreign keys
- [ ] `tasks` has `completed_at` + `original_deadline`; `task_extensions` exists; `designations.capability_tier` exists
- [ ] `user_performance` view exists and returns correct shape
- [ ] Railway deploys successfully from GitHub on push
- [ ] Founder account seeded with leadership tier; no signup path can self-assign it

### Human checkpoint
Manually log in. Open Supabase table editor and confirm all 7 tables + the view. Confirm the frontend bundle does **not** contain the service-role key.

---

## Phase 1A — The AI Pipeline (Weeks 2–3)

**Gate status: 🔄 IN PROGRESS — frontend built; needs real recording test**

### Build tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1A.1 | `RecordButton.tsx` — tap to start/stop, waveform, red button + timer, mic permission handling | ✅ | WebM/MP4 auto-detect; wave-bar CSS animation |
| 1A.2 | Async upload to FastAPI → return job ID immediately | ✅ | `api.uploadRecording()` in `lib/api.ts` |
| 1A.3 | Backend: AssemblyAI transcription (Hinglish model) running in background | ✅ | (was already done Session 1) |
| 1A.4 | Supabase Realtime subscription on job row — frontend listens for result | ✅ | In all 3 recording pages; subscribes on `recording_jobs` UPDATE |
| 1A.5 | Claude extraction prompt — **Task**: `{ doer_name, description, deadline, report_to_name }` | ✅ | (was already done Session 1) |
| 1A.6 | Claude extraction prompt — **Meeting**: `{ mom_summary, tasks: [...] }` | ✅ | (was already done Session 1) |
| 1A.7 | Claude extraction prompt — **Idea**: `{ summary, tags: [...] }` | ✅ | (was already done Session 1) |
| 1A.8 | `ReviewForm.tsx` — auto-fill with Claude's output; Doer + Report To are searchable dropdowns (Name + Company) from `users` | ✅ | Name-matching pre-selects best guess; Name + Company shown |
| 1A.9 | Missing-field gate — highlight red + lock submit if any of: Doer, Description, Deadline, Report To is empty | ✅ | Red border + inline error labels + button disabled |
| 1A.10 | On submit: capture `original_deadline = deadline` at creation | ✅ | Both fields set to same ISO string at submit time |
| 1A.11 | Meeting submit: save each task as its own row linked via `meeting_id`; per-task missing-field check; batch review scrollable list | ✅ | Scrollable task list in ReviewForm; `/meetings/batch` call |

### Exit gate checklist

- [ ] All 3 flows produce correct JSON from Hindi / English / Hinglish audio
- [ ] Extraction accuracy above **85%** on 20 test recordings
- [ ] Missing-field UI fires correctly when deadline or doer is absent
- [ ] `original_deadline` is captured at creation and equals `deadline` initially

### Human checkpoint
Record several real Hinglish clips. Confirm dropdowns disambiguate same-name people by company. Confirm meeting recording produces multiple correct task rows linked to one meeting.

---

## Phase 1B — Views, Dashboard, Scoring (Weeks 4–5)

**Gate status: 🔄 IN PROGRESS — built; needs real device test**

### Build tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1B.1 | **Tasks Received** — standalone top-level view; source tag; teal/red/green; pagination + search | ✅ | `app/(app)/received/page.tsx` |
| 1B.2 | **Tasks Allocated** — standalone top-level view; same design | ✅ | `app/(app)/allocated/page.tsx` |
| 1B.3 | **Meetings view** — list of past meetings; MoM summary + task count; tap to read full minutes | ✅ | `app/(app)/meetings/page.tsx` + `meetings/[id]/page.tsx` |
| 1B.4 | Mark task complete — button on card → `status = completed`, `completed_at = now()`, optional note | ✅ | In `TaskCard.tsx` |
| 1B.5 | **`ExtensionModal.tsx`** — reason + proposed deadline → `task_extensions` row; card shows badge | ✅ | `components/ExtensionModal.tsx` |
| 1B.6 | Assignor side of extension — badge on Tasks Allocated; Approve/Deny | ✅ | In `TaskCard.tsx` (mode=allocated) |
| 1B.7 | **My Performance view** — two metric cards + totals + extension history | ✅ | `app/(app)/performance/page.tsx` + `ScoreCard.tsx` |
| 1B.8 | **Ideas view** — inline with Idea page (recent 5 shown); full feed deferred to own route | ✅ | Ideas show in `app/(app)/idea/page.tsx` |
| 1B.9 | **Home dashboard** — four live count cards via Supabase Realtime | ✅ | `app/(app)/page.tsx` — Realtime subscription on `tasks` table |
| 1B.10 | Mobile-responsive layout — test on real Android + iPhone | ⏳ | Sidebar + bottom nav built; **needs real device test** |

### Exit gate checklist

- [ ] Dashboard counts accurate and update in real time
- [ ] **RLS confirmed:** a user cannot see another company's tasks (tested with non-admin user)
- [ ] My Performance shows correct on-time % and overdue count; an approved extension visibly protects the score
- [ ] Extension request → approve/deny flow works end to end with audit fields populated
- [ ] Works correctly on real mobile browsers

### Human checkpoint
Create a task → miss deadline (goes overdue) → request + approve extension → complete it → confirm on-time % NOT penalised. Then complete a different task late with no extension → confirm it WAS counted against the score.

---

## Phase 1C — Pilot & Stabilise (Weeks 6–8)

**Gate status: 🔒 BLOCKED — Phase 1B gate not cleared**

### Build tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1C.1 | Seed pilot accounts: founder's office + 1–2 team leads | ⏳ | Run real meetings + task delegations daily |
| 1C.2 | **Org Performance view** — `/org-performance/` + `performance.py`; gated on `capability_tier = 'leadership'`; searchable by name/email; shows on-time %, overdue count, task volume per employee across all 3 companies; scores + counts only | ⏳ | Both backend RLS + conditional frontend rendering enforced |
| 1C.3 | Measure extraction accuracy on real recordings — deadline parsing, doer identification, Hinglish handling | ⏳ | Target: 90%+ |
| 1C.4 | Two full rounds of bug fixes from pilot feedback | ⏳ | |
| 1C.5 | Error states: AssemblyAI failure, Claude bad JSON, upload timeout — user can re-record or edit raw transcript manually | ⏳ | |
| 1C.6 | Submit WhatsApp message templates to Meta (Week 6) | ⏳ | Approval takes 3–7 days; must not block Phase 2 |
| 1C.7 | Decide WhatsApp provider: Meta Cloud API / AiSensy / Twilio | ⏳ | |

### Exit gate checklist (HARD GATE — Phase 2 is BLOCKED until all pass)

- [ ] Extraction accuracy above **90%** on real pilot recordings
- [ ] Schema stable — no structural changes needed after 2 weeks of real use
- [ ] Pilot users actively using the tool, **not reverting to WhatsApp**
- [ ] WhatsApp templates submitted to Meta for approval
- [ ] Leadership dashboard verified: standard-tier user **cannot** access Org Performance (tested via direct API call, not just hidden UI)

### Human checkpoint
Personally try to reach the Org Performance endpoint while logged in as a standard user — must be **rejected by the backend**, not merely hidden. Confirm founder account sees all three companies' scores and search works.

---

## Phase 2 — Org-Wide Rollout & Automation (Weeks 9–15)

**Gate status: 🔒 BLOCKED — Phase 1C hard gate not cleared**

> Detailed planning happens only after Phase 1's hard gate is cleared. Summary only.

| Feature | Status |
|---------|--------|
| WhatsApp notifications (task creation, deadline reminder, overdue alert, completion, extension decisions) | ⏳ |
| Pending Actions screen — review/edit/cancel any system message before it goes out | ⏳ |
| Google Calendar events from meeting MoMs | ⏳ |
| MoM export to `_BRAIN/MTG` Drive folder | ⏳ |
| Read-only Google Sheets mirror | ⏳ |
| Bulk user seeding across all 3 companies | ⏳ |
| Full designation-tier feature gating (multiple tiers) | ⏳ |
| Self-signup (with leadership designation excluded from dropdown) | ⏳ |

---

## Phase 3 — AI Calling & Full Autonomy (Weeks 16–19)

**Gate status: 🔒 BLOCKED — Phase 2 not complete**

| Feature | Status |
|---------|--------|
| VAPI.ai calling agent for overdue task follow-up (gated via Pending Actions) | ⏳ |
| Call transcripts stored in Supabase | ⏳ |
| Leadership tier: AI-drafted outbound messages + proactive calendar control | ⏳ |

---

## What's Built

### Session 1 — 2026-06-23 — Backend complete

**Supabase migrations** (run in order in Supabase SQL editor):
```
supabase/migrations/0001_companies.sql
supabase/migrations/0002_designations.sql
supabase/migrations/0003_users.sql
supabase/migrations/0004_tasks.sql
supabase/migrations/0005_task_extensions.sql
supabase/migrations/0006_meetings.sql
supabase/migrations/0007_ideas.sql
supabase/migrations/0008_fk_task_meeting.sql
supabase/migrations/0009_updated_at_trigger.sql
supabase/migrations/0010_user_performance_view.sql
supabase/migrations/0011_recording_jobs.sql
supabase/seed.sql
```

**FastAPI backend** (`backend/`):
```
main.py                         ← FastAPI app + CORS + all routers
requirements.txt                ← pinned deps (openai, supabase, assemblyai, fastapi)
.env.example                    ← copy to .env and fill keys
routers/auth.py                 ← GET /auth/me
routers/users.py                ← GET /users (dropdown data)
routers/recordings.py           ← POST /recordings/upload, GET /recordings/jobs/{id}
routers/tasks.py                ← GET /tasks/received|allocated|dashboard, POST /tasks, PATCH /tasks/{id}/complete
routers/extensions.py           ← POST /extensions, PATCH /extensions/{id}/decide
routers/meetings.py             ← GET /meetings, GET /meetings/{id}, POST /meetings/batch
routers/ideas.py                ← GET /ideas, POST /ideas
routers/performance.py          ← GET /performance/me, GET /performance/org (leadership only), GET /performance/extensions/my
services/supabase.py            ← Supabase service-role client (singleton)
services/assemblyai.py          ← transcribe() — AssemblyAI Hinglish model
services/extraction.py          ← extract_task/meeting/idea() — Claude API (anthropic SDK, claude-opus-4-8)
models/schemas.py               ← all Pydantic request/response models
railway.toml                    ← Railway deployment config
```

---

### Session 2 — 2026-06-23 — Frontend complete

**Infrastructure:**
```
frontend/proxy.ts                          ← Session refresh + auth route protection (Next.js 16 convention)
frontend/lib/types.ts                      ← All TypeScript types (mirrors Pydantic schemas)
frontend/lib/api.ts                        ← All backend API calls with auth headers
frontend/lib/supabase/client.ts            ← Browser Supabase client (anon key)
frontend/lib/supabase/server.ts            ← Server Supabase client (anon key + cookies)
frontend/.env.local                        ← NEXT_PUBLIC_SUPABASE_URL/ANON_KEY/BACKEND_URL
```

**Auth + Layout:**
```
frontend/app/login/page.tsx                ← Two-step email → OTP login
frontend/app/(app)/layout.tsx              ← Server auth check → redirect /login if no session
frontend/components/Nav.tsx                ← Desktop sidebar + mobile top bar + bottom nav
```

**Components:**
```
frontend/components/RecordButton.tsx       ← Record/stop, waveform animation, WebM/MP4 detect, timer
frontend/components/ReviewForm.tsx         ← Auto-fill form; searchable user dropdowns; missing-field gate
frontend/components/TaskCard.tsx           ← Status colours, complete button, extension request/approve
frontend/components/ExtensionModal.tsx     ← Doer raises extension: reason + proposed deadline
frontend/components/ScoreCard.tsx          ← Metric display card
```

**Pages:**
```
frontend/app/(app)/page.tsx                ← Dashboard: 4 live count cards (Realtime) + quick actions
frontend/app/(app)/delegate/page.tsx       ← Task delegation flow (record → process → review → save)
frontend/app/(app)/meeting/page.tsx        ← Meeting recording flow
frontend/app/(app)/idea/page.tsx           ← Idea capture flow + recent ideas feed
frontend/app/(app)/received/page.tsx       ← Tasks Received (search + pagination)
frontend/app/(app)/allocated/page.tsx      ← Tasks Allocated (search + pagination + extension approve)
frontend/app/(app)/meetings/page.tsx       ← Meetings list
frontend/app/(app)/meetings/[id]/page.tsx  ← Meeting detail with MoM + tasks
frontend/app/(app)/performance/page.tsx    ← My Performance (on-time % + overdue + extension history)
frontend/app/(app)/org-performance/page.tsx ← Org Performance (leadership-gated; searchable table)
```

**Build status:** `npm run build` passes, zero TypeScript errors, zero warnings.

---

## Decisions Log

> Track any decisions made during build that deviate from or extend plan.md.

| Date | Decision | Reason |
|------|----------|--------|
| 2026-06-23 | project started; plan.md used directly as spec (no separate spec.md) | plan.md is comprehensive enough to serve both purposes |

---

---

### Session 3 — 2026-07-06 — Local dev running; infra migration planned

**Fixes applied this session:**
```
frontend/app/page.tsx              ← Replaced default Next.js starter; now auth-checks + renders dashboard
frontend/app/(app)/page.tsx        ← Fixed Realtime channel conflict (unique channel name per mount + removeChannel on cleanup)
frontend/app/login/page.tsx        ← OTP digit count corrected (maxLength 8, disabled until 6+ entered)
backend/.env                       ← Recreated after accidental deletion; correct Supabase URL confirmed
.vscode/settings.json              ← Created; points to meetup/venv/Scripts/python.exe (fixes Pylance warnings)
```

**Current local run state:**
- Backend: `python -m uvicorn backend.main:app --reload` from `meetup/` root
- Frontend: `npm run dev` from `meetup/frontend/`
- Supabase: personal account (iuvpvoojsrgjseoxtbtz) — **to be replaced**
- Email OTP: Supabase built-in (custom SMTP disabled for now)
- User seeded: founder account (ai.support@ecoste.in) with leadership designation

---

## Planned Next: Infra Migration (do in order)

### Step A — New Supabase project under company email

| # | Task | Status |
|---|------|--------|
| A.1 | Create new Supabase project at supabase.com logged in with `ai.support@ecoste.in` | ⏳ |
| A.2 | Copy new Project URL + anon key + service role key from new project Settings → API | ⏳ |
| A.3 | Run all migrations in new project SQL editor (in order, one by one): `0001` → `0011` | ⏳ |
| A.4 | Run `supabase/seed.sql` in new project SQL editor | ⏳ |
| A.5 | In Supabase Auth settings: enable Email OTP, set OTP expiry to 10 min | ⏳ |
| A.6 | Create `audio` storage bucket (private) in new project | ⏳ |
| A.7 | Update `backend/.env` → new SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY | ⏳ |
| A.8 | Update `frontend/.env.local` → new NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY | ⏳ |
| A.9 | Add founder user to new Supabase Auth (Authentication → Users → Invite) | ⏳ |
| A.10 | Run founder insert SQL in new project (same as seed.sql founder block with new auth UUID) | ⏳ |
| A.11 | Test OTP login on new project | ⏳ |

### Step B — Brevo SMTP with company domain

| # | Task | Status |
|---|------|--------|
| B.1 | Create Brevo account with `ai.support@ecoste.in` | ⏳ |
| B.2 | In Brevo → Senders, Domains, IPs → Domains → Add `ecoste.in` | ⏳ |
| B.3 | Add the 3 DNS records Brevo provides (SPF, DKIM, DMARC) to domain registrar | ⏳ |
| B.4 | Verify domain in Brevo (click Verify after DNS propagates — can take up to 24h) | ⏳ |
| B.5 | Add sender: `noreply@ecoste.in` (or `meetup@ecoste.in`) | ⏳ |
| B.6 | In Brevo → SMTP & API → copy the SMTP Key (starts with `xsmtp-...`) | ⏳ |
| B.7 | In new Supabase → Authentication → SMTP Settings → enable custom SMTP: host `smtp-relay.brevo.com`, port `587`, username = Brevo login email, password = SMTP Key from B.6, sender = `noreply@ecoste.in` | ⏳ |
| B.8 | Test OTP email with custom SMTP live | ⏳ |

---

## Known Issues / Tech Debt

> Track bugs found during pilot or items to revisit.

| # | Issue | Phase found | Priority | Status |
|---|-------|-------------|----------|--------|
| 1 | Old Supabase project (iuvpvoojsrgjseoxtbtz) under personal Gmail — to be replaced by Step A | Setup | High | ✅ Done — new project `nydmbszpzygkqutoyzkn` live under ai.support@ecoste.in; all 8 tables + seeds verified via REST |
| 5 | Extraction can't resolve relative deadlines ("Friday", "Monday tak") — prompt has no notion of "today", so deadlines come back as wrong-year dates or null. Pre-existing (was true on OpenAI too). | Phase 0 (found during Claude smoke test) | High | ✅ Done — `_now_context()` in extraction.py injects current IST datetime (fixed UTC+5:30, no tzdata dep) into task+meeting prompts. Verified: Friday→2026-07-24, Monday tak→2026-07-27, Wednesday tak→2026-07-22. |
| 6 | `service_role` key was pasted into a chat transcript during env setup — rotate after pilot (Supabase → Settings → API → roll) and re-write `backend/.env`. | Setup | Medium | ⏳ Planned |
| 7 | ~~All seeded designations are standard-tier~~ — **FALSE ALARM.** A `Founder`/`leadership` designation (`…0002-…0001`) was already in the seed; my initial `limit=4` sample just didn't include it. Founder `users` row is attached to it. | Setup | — | ✅ Resolved (no action) |
| 8 | Custom SMTP (Brevo) not configured — Supabase default email is rate-limited/unreliable for OTP. Founder login uses admin-generated magic link (`generate_login_link.py` / seed script) to bypass the inbox. Set up Brevo SMTP before onboarding real employees. | Setup | Medium | ⏳ Planned (before pilot) |
| 2 | Navigation between pages hits server auth check on every route — slight lag in dev | Phase 1B | Low | Acceptable in dev; faster on Railway |
| 3 | GitHub CI (task 0.22) not wired — build passes locally but no automated checks on push | Phase 0 | Medium | ⏳ Deferred |
| 4 | `services/extraction.py` uses OpenAI `gpt-4o`; decision locked to **Claude API only, no OpenAI**. Swap SDK client + call (prompts & return shapes unchanged), replace `openai` with `anthropic` in `requirements.txt`, and use `ANTHROPIC_API_KEY` (not `OPENAI_API_KEY`) in env. | Setup | High | ✅ Done — swapped to `anthropic` SDK, model `claude-opus-4-8`, system prompts + JSON shapes unchanged, `temperature` dropped (rejected on Opus 4.8), `max_tokens=4096` added, parses first text block. `requirements.txt` now `anthropic>=0.40.0`. |
