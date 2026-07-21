# MeetUp — Build Plan (`plan.md`)

> **Internal Operations Platform · Master Build Document**
> Voice-first capture for tasks, meeting outcomes, and ideas across **Ecoste** (WPC building products), **Lamora** (door solutions), and **Metamask** (metal facade systems).
>
> **Owner:** Ankur Hora — Founder's Office
> **Status:** Prototype **approved by the CEO**. This is now a **production build**, not an experiment.
> **Target scale:** **200–300 employees** across Ecoste, Lamora, and Metamask (200 at launch, up to ~300).
> **Infrastructure:** Production Supabase project owned by **ai.support@ecoste.in** (service-role key in backend/Railway env only; frontend uses the anon key).
> **Build mode:** Claude builds most of it; human reviews and fixes errors at checkpoints.
> **Source spec:** MeetUp Phase 1 Specification v2.1 + agreed additions (scoring, deadline renegotiation, leadership dashboard).
> **This file is the single source of truth.** When in doubt, follow this document over memory or assumption.
>
> **Production note:** CEO approval greenlights building for real — it does **not** cancel the phased discipline. The Phase 1C hard gate (prove extraction accuracy on a small supervised group) still stands, precisely *because* 200–300 people will depend on this. "Production for 200–300" = seeing the build through **Phase 2** (org-wide rollout), not shipping everything to everyone on day one. Two things are now hard prerequisites rather than nice-to-haves: (1) **database indexes** — added in migration `0013`, already in `run_all_migrations.sql`; and (2) **custom SMTP (Brevo)** — Supabase's built-in email will rate-limit long before 200 people can receive OTPs, so it must be wired up before broad onboarding.

---

## How to use this file

This plan is written for a mixed workflow:

- **Roadmap sections** tell you *what we're building and why* — read these to stay oriented.
- **Build instruction blocks** give exact file paths, schemas, and logic — Claude executes these.
- **`✅ HUMAN CHECKPOINT`** markers are where *you* stop and verify before moving on. Do not skip these.
- **`🚪 EXIT GATE`** markers are hard gates. Phase work does not advance until every box is ticked.

Work top to bottom. Each phase assumes the previous one passed its gate.

---

## Table of contents

1. [Product summary & core principles](#1-product-summary--core-principles)
2. [What changed from spec v2.1 (the additions)](#2-what-changed-from-spec-v21-the-additions)
3. [The core loop](#3-the-core-loop)
4. [Navigation & screen map](#4-navigation--screen-map)
5. [Database schema (full, with additions)](#5-database-schema-full-with-additions)
6. [Scoring & deadline renegotiation — design](#6-scoring--deadline-renegotiation--design)
7. [Leadership dashboard & access control — design](#7-leadership-dashboard--access-control--design)
8. [Technology stack](#8-technology-stack)
9. [Repository & architecture](#9-repository--architecture)
10. [Phase 0 — Project setup](#10-phase-0--project-setup)
11. [Phase 1A — The AI pipeline](#11-phase-1a--the-ai-pipeline)
12. [Phase 1B — Views, dashboard, scoring](#12-phase-1b--views-dashboard-scoring)
13. [Phase 1C — Pilot & stabilise](#13-phase-1c--pilot--stabilise)
14. [Phase 2 — Org-wide rollout & automation](#14-phase-2--org-wide-rollout--automation)
15. [Phase 3 — AI calling & full autonomy](#15-phase-3--ai-calling--full-autonomy)
16. [Success metrics](#16-success-metrics)
17. [Locked decisions](#17-locked-decisions)
18. [Security checklist](#18-security-checklist)
19. [Glossary](#19-glossary)

---

## 1. Product summary & core principles

MeetUp is an **internal-only** platform built around three actions: **delegate a task, record a meeting, or store an idea**. A person taps a button, speaks in Hindi / English / Hinglish, and the system transcribes, structures, stores, and routes what they said to the right people.

It is **not** a project-management tool. It is a **voice-first capture layer** that turns spoken intent into a structured, searchable, accountable record — for *every* employee, not just leadership.

**The build reuses the proven CoachUp pipeline pattern** (audio → AssemblyAI transcript → Claude extraction), ported into a fresh MeetUp codebase. The new work is the data model, the three recording flows, the task/scoring views, and the phased rollout.

### Non-negotiable principles (apply to every line of code)

1. **UUID primary keys everywhere** — so the future CRM can reference rows without ID collisions.
2. **A person is always a foreign key to `users.id`** — never a copied text name on another table. If you find yourself writing a name string into `tasks` or `meetings`, stop: it must be a user reference.
3. **Row-Level Security (RLS) enforced in Postgres**, not just hidden in the UI. A user reads/writes only their own scoped rows.
4. **No autonomous actions in Phase 1.** Every record is confirmed by the human who hits submit. That submission *is* the approval.
5. **Validate AI accuracy on a small supervised pilot before the system is ever trusted to message or call people.** Get extraction right first; everything else is built on that foundation.
6. **Scores are derived, never stored.** Performance is computed live from the `tasks` table — never a mutable number on the user.

---

## 2. What changed from spec v2.1 (the additions)

Four additions were agreed on top of the original spec. They are woven into the relevant sections below; summarised here so nothing is missed.

| # | Addition | Where it lives | Key rule |
|---|----------|----------------|----------|
| 1 | **Doer scoring** — each doer sees their own performance | Phase 1B (view), Phase 0 (schema) | Two metrics: on-time completion % **and** current overdue count. Derived live, never stored. |
| 2 | **Deadline renegotiation** — doer flags a bottleneck, assignor approves a new deadline; the doer's score is judged against the *current* (approved) deadline, so an approved extension carries no penalty | Phase 1 (schema + flow) | Protection comes from the extension being **approved**, not merely claimed. Full audit trail via `task_extensions`. |
| 3 | **Leadership dashboard** — a CEO/Founder-tier user sees scores of all employees across all three companies, searchable by name/email | Phase 1C (minimal), expanded in Phase 2 | Gated by `capability_tier = 'leadership'`, **assigned by seeding/admin — never self-selected at signup.** Self-claiming "CEO" is structurally impossible. |
| 4 | **Schema support for the above** | Phase 0 | New fields `completed_at`, `original_deadline` on `tasks`; new `task_extensions` table; `capability_tier` actively used. |

### Why scoring is derived, not stored (read once, never forget)

A stored `score` column drifts out of sync, can't be audited, and can't be recomputed when the formula changes. Instead the score is a **Postgres view** (or API computation) that reads task rows live. Two timestamps make it possible:

- `completed_at` — set when a task flips to completed. *Required* for "on time" — `updated_at` won't do because it changes on any edit.
- `original_deadline` — captured once at creation, never changed. Lets leadership see "this slipped twice" even when the doer's score is protected by an approved extension.

---

## 3. The core loop

The whole product is one loop, repeated three ways.

```
1. SPEAK      → User taps mic, speaks naturally (Hindi/English/Hinglish), taps stop.
2. TRANSCRIBE → Audio uploads to FastAPI → AssemblyAI → Hinglish transcript.
3. EXTRACT    → Transcript → Claude → structured JSON (who / what / by when / report to).
4. CONFIRM    → User sees auto-filled form, corrects anything wrong, fills missing fields, submits.
5. ROUTE      → Structured record saved; instantly visible to everyone it concerns.
```

### The same loop, three ways

| Entry point | What Claude extracts | What makes it different |
|-------------|---------------------|-------------------------|
| **Task Delegation** | One task: doer, description, deadline, report-to (assignor = recorder) | Simplest. One recording → exactly one task. |
| **Meeting Recording** | A meeting summary (MoM) **plus an array of tasks** — many tasks for many people | One recording → multiple tasks, each with its own doer/deadline. Reviewed together, submitted as a batch. |
| **Idea Storage** | A short summary + topic tags. No doer, no deadline. | Lightest. No mandatory fields, no review gate. Tap, talk, done. Visible to the whole org. |

### Async processing — the architecture decision that matters most

The recording pipeline **must not be a single blocking HTTP request.** Transcribing a 3-minute meeting takes 20–40s; a synchronous request freezes the screen and dies when a phone locks or backgrounds the browser.

Instead:
- Upload returns a **job ID immediately**.
- Backend processes in the **background**.
- Frontend listens for the finished result via a **Supabase Realtime subscription** on the row.

For Phase 1's small pilot, a **Supabase-table-as-queue** is enough — replaceable later without changing the API.

---

## 4. Navigation & screen map

**Critical navigation rule:** Task list views are **standalone top-level views**, NOT nested inside the recording flows. A task is a task whether it came from a delegation or a meeting — it lands in the same place. Each task card shows a small `direct` or `from meeting` tag (driven by the existing `source` field — no schema change needed for this).

### Home screen (every logged-in user sees)

| Home item | Type | What it does |
|-----------|------|--------------|
| Task Delegation | Recording | Record one task → single task object |
| Meeting Recording | Recording | Record a meeting → MoM + N tasks for N people |
| New Idea / Idea Storage | Recording + View | Capture an idea; browse the universal feed |
| Home / Dashboard | View | Live counts: given-open, received, completed, overdue |
| **My Performance** *(new)* | View | The logged-in user's own on-time % + overdue count |
| Tasks Received | View | Every task assigned to me (delegation OR meeting), with source tag |
| Tasks Allocated | View | Every task I assigned to others, with status |
| Meetings | View | Past meetings with their MoM summaries + tasks generated |

### Leadership-only home item (visible only when `capability_tier = 'leadership'`)

| Home item | Type | What it does |
|-----------|------|--------------|
| **Org Performance** *(new, gated)* | View | Scores of all employees across all three companies; search by name/email |

### Screen states to build (from spec — desktop + phone)

- **Home / Dashboard**: 4 live count cards (given-open, received, completed, overdue) via Realtime; quick-action buttons; recent activity list.
- **Recording in progress**: red mic button + timer; live "Transcribing…"; then "Analysing your recording…" loading state (covers the 15–30s AI wait).
- **Review form — all fields found**: green ✓ banner; Doer + Report To as searchable dropdowns (Name + Company), pre-set to Claude's guess; Deadline; Assigned By (you, locked); Confirm button enabled.
- **Review form — missing field**: ⚠ banner; missing field turns red ("No deadline found — please add"); submit locked until filled.
- **Tasks Received / Allocated**: unified list, source tag, status colours (**teal** = open/on-track, **red** = overdue, **green** = completed). Server-side pagination + keyword search from day one.
- **Meetings**: list of past meetings, MoM summary, count of tasks generated, recorded-by; tap to read full minutes.
- **Idea feed**: universal across all companies; filter by company + date; keyword search.
- **My Performance** *(new)*: two metric cards + a list of the user's own completed/overdue tasks; extension history.
- **Org Performance** *(new, leadership)*: searchable table of all employees with on-time %, overdue count, task volume, company.

> **Name-matching:** Doer and Report To dropdowns are pre-loaded from `users`, showing **Name + Company**. Claude's best guess is pre-selected but correctable. The Company column disambiguates two people with the same name across companies. The system never silently picks the wrong person.

---

## 5. Database schema (full, with additions)

**Seven tables** (six original + `task_extensions`). UUID keys everywhere. A person is always an FK to `users.id`. All schema SQL lives versioned in `supabase/migrations/`.

### `companies` — 3 rows: Ecoste, Lamora, Metamask
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `name` | text | Ecoste / Lamora / Metamask |

### `designations` — role lookup; gates feature access
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `name` | text | e.g. Team Lead, Executive, CEO |
| `capability_tier` | text | `standard` \| `leadership`. **Controls which features the role sees.** |
| `company_id` | uuid FK → companies | |

> **`capability_tier` is the security backbone of the leadership dashboard.** See §7. Leadership is a *tier*, not a free-text title.

### `users` — central identity table; every other table points here
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `name` | text | |
| `email` | text | Used for OTP login |
| `phone` | text | Used for WhatsApp in Phase 2 |
| `is_active` | boolean | Soft-delete flag — **never hard-delete a user** |
| `company_id` | uuid FK → companies | |
| `designation_id` | uuid FK → designations | **A normal user can never set this to a leadership-tier designation themselves.** See §7. |

### `tasks` — the core operational table (heart of the product)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `source` | enum | `task_delegation` \| `meeting` |
| `meeting_id` | uuid FK → meetings · nullable | Set only when `source = meeting` |
| `assignor_id` | uuid FK → users | Always the logged-in recorder |
| `assignee_id` | uuid FK → users | The doer |
| `description` | text | |
| `deadline` | timestamp | **Current** deadline (moves when an extension is approved) |
| `original_deadline` | timestamp | **NEW.** Captured once at creation, never changed. Audit + slip tracking. |
| `report_to_id` | uuid FK → users | |
| `status` | enum | `open` \| `completed` \| `overdue` |
| `completed_at` | timestamp · nullable | **NEW.** Set when status → completed. Required for on-time scoring. |
| `completion_note` | text · nullable | Optional note from doer on completion |
| `created_at` | timestamp | |
| `updated_at` | timestamp | Auto-updated via Postgres trigger |

### `task_extensions` — **NEW.** Deadline renegotiation, with audit trail
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `task_id` | uuid FK → tasks | |
| `requested_by` | uuid FK → users | The doer raising the bottleneck |
| `reason` | text | The bottleneck explanation |
| `proposed_deadline` | timestamp | The new date the doer is requesting |
| `status` | enum | `requested` \| `approved` \| `denied` |
| `decided_by` | uuid FK → users · nullable | The assignor who approved/denied |
| `decided_at` | timestamp · nullable | |
| `created_at` | timestamp | |

> **On approval:** the parent task's `deadline` is updated to `proposed_deadline`. `original_deadline` is untouched. This is what makes the score fair without making it gameable — see §6.

### `meetings` — one row per recorded meeting session
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `recorded_by` | uuid FK → users | |
| `company_id` | uuid FK → companies | |
| `transcript` | text | Full AssemblyAI output |
| `audio_url` | text | Supabase Storage signed URL · 90-day retention |
| `mom_summary` | text | Claude's minutes-of-meeting |
| `created_at` | timestamp | |

### `ideas` — universal; visible to all employees, all companies
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `recorded_by` | uuid FK → users | |
| `summary` | text | |
| `tags` | text[] | Postgres array — searchable with `@>` operator |
| `created_at` | timestamp | |

### Status lifecycle note

`status` should be kept accurate by a scheduled job / Postgres logic: a task whose `deadline` has passed while still `open` becomes `overdue`. **An approved extension that moves the deadline into the future should move the task back from `overdue` to `open`.** Mark-complete sets `status = completed` and `completed_at = now()`.

---

## 6. Scoring & deadline renegotiation — design

### 6.1 What the doer sees (My Performance)

Two metrics, **never one** (a single number hides a doer who has a high on-time % while sitting on a pile of never-completed overdue tasks):

1. **On-time completion rate** = `count(completed tasks where completed_at <= deadline) / count(completed tasks)`, shown as a %.
2. **Current overdue count** = `count(tasks where status = overdue)`.

Supporting display: total tasks received, total completed, average days-to-complete, and the user's extension history.

### 6.2 How the score stays fair (the renegotiation mechanism)

The score judges `completed_at <= deadline` against the **current** deadline.

- Doer hits a genuine bottleneck → raises an extension request (`task_extensions` row, `status = requested`) with a reason and a proposed new date.
- Assignor reviews and **approves** → task's `deadline` moves to the proposed date → the doer is now judged against the new date → **no penalty.**
- Assignor **denies** → deadline unchanged → the bar stays where it was.

**Why this can't be gamed:** protection comes from the extension being *approved* by the assignor, not from the doer merely claiming a bottleneck. Every extension is a permanent audit row, and `original_deadline` always shows the true initial commitment, so leadership can still see slippage even where the doer's score is protected.

### 6.3 Implementation

- Build the score as a **Postgres view** (e.g. `user_performance`) so it's recomputable and consistent across the app, and a thin API endpoint that reads it. Never write a `score` column onto `users`.
- The view computes per-user: on-time %, overdue count, totals, avg days-to-complete.
- RLS on the view: a standard user can read **only their own row**. The leadership tier can read **all rows** (the one deliberate cross-company exception — see §7).

### 6.4 Flow: requesting & approving an extension

```
Doer side:
  1. On a received, still-open task → "Request more time" button.
  2. Form: reason (required) + proposed new deadline (required).
  3. Submit → task_extensions row created (status = requested).
  4. Task card shows "Extension requested — awaiting approval".

Assignor side:
  5. On Tasks Allocated, the task shows a pending-extension badge.
  6. Assignor sees reason + proposed date → Approve or Deny.
  7. Approve → tasks.deadline = proposed_deadline; extension.status = approved;
              if task was overdue and new deadline is future → status back to open.
  8. Deny → extension.status = denied; nothing else changes.
  9. Both outcomes recorded with decided_by + decided_at.
```

> **Phase note:** the schema fields and the extension request→approve flow are built in **Phase 1** (genuinely useful during the supervised pilot). The "My Performance" card ships in **Phase 1B**. In Phase 2, the report-to person and assignor can also receive WhatsApp notifications on extension decisions.

---

## 7. Leadership dashboard & access control — design

### 7.1 The requirement

There is **no separate admin app.** A CEO/Founder-tier user logs in through the same flow as everyone, but sees one **additional** home item — **Org Performance** — showing scores of all employees across all three companies, searchable by name and email.

### 7.2 The security model (read carefully — this is the core trap to avoid)

**A user must never be able to self-grant leadership access.** If typing "CEO" into a designation field unlocked cross-company visibility, anyone could read all 200–300 employees' data. That would directly break Principle 3 (RLS).

The protection does **not** come from "we created only one CEO designation row." The designation existing in the table doesn't bind it to one human — the real question is *who is allowed to attach that designation to their own account.* The rules:

1. **Leadership is a `capability_tier`, not a free-text title.** The Org Performance view unlocks for `capability_tier = 'leadership'`, never for whatever string a user typed.
2. **A normal user can never set their own `designation_id` to a leadership-tier designation.** Enforced in **two** places:
   - **At signup / profile edit:** the designation dropdown shown to a new/standard user **excludes all leadership-tier designations.** They literally cannot pick "CEO." If the API receives a request trying to set a leadership-tier designation from a non-admin session, the backend **rejects it.**
   - **In the database (RLS):** the cross-company performance policy checks the user's **actual stored `capability_tier`** — not anything they typed or submitted. Even if a bad value somehow landed in a row, the policy reads the verified tier.
3. **The leadership tier is assigned by seeding or by an admin — never self-service.** For the Phase 1 pilot (founder's office + 1–2 team leads, all seeded), the founder account is **seeded with the leadership tier directly.** There is no self-elevation path in Phase 1 at all.

> **Result:** the CEO flow opens only for the one person whose row you seeded with the leadership tier. "Self-claiming CEO" is structurally impossible because no normal signup path can write that tier onto an account. This holds even later when real self-signup turns on in Phase 2.

### 7.3 What the leadership dashboard shows (scope-limited)

- A searchable table: employee name, company, on-time %, overdue count, task volume.
- Search by **name** and **email**.
- **Scores + counts only** — no raw task-text drill-down for now (a privacy line worth holding for the pilot). Full drill-down can be a deliberate Phase 2 decision if wanted.

### 7.4 Implementation

- The leadership read is the **one deliberate RLS exception**, tightly scoped to the `user_performance` view (scores/counts), gated on `capability_tier = 'leadership'`.
- Standard tier: RLS allows reading only their own performance row.
- The Org Performance home item is conditionally rendered on the frontend **and** protected by RLS on the backend (never UI-only).

> **Phase note:** the spec parked "designation-tier feature gating" in Phase 2. We pull a **minimal** version forward to **Phase 1C** — just the leadership tier + the scoring dashboard. Broader tier-gating (multiple tiers, more gated features) stays in Phase 2.

---

## 8. Technology stack

Each choice is documented so it isn't accidentally reversed mid-build.

| Layer | Technology | Why this, not the alternative |
|-------|-----------|-------------------------------|
| Backend | **FastAPI (Python)** | Async-native (the pipeline waits on AssemblyAI + Claude). AssemblyAI / Anthropic / Google SDKs are first-class in Python. Auto API docs. Not Flask (no native async); not Django (too heavy). |
| Frontend | **Next.js (React) + Tailwind** | SSR → fast first load on mid-range Android. One codebase, mobile + desktop. Not a pure SPA (blank screen on slow first load). |
| Database | **Supabase (Postgres)** | RLS enforced in Postgres itself. Built-in Auth (email OTP). Realtime powers the live dashboard with no custom WebSockets. Separate project from CoachUp. |
| Transcription | **AssemblyAI** | Best-in-class Hinglish accuracy — the org's actual language mix. Speaker diarization helps meetings. Proven in CoachUp. Not Whisper (weaker Hinglish); not Google STT (more complex). |
| AI extraction | **Claude API** | Reliable structured-JSON extraction from messy conversational speech. Three system prompts, one client. Proven in CoachUp. |
| Hosting | **Railway** | Auto-deploys from GitHub on push. Native env-var management — secrets never touch the repo. Hosts both Python + Node services. |
| File storage | **Supabase Storage** | Same RLS model as the DB. Signed URLs with expiry for audio — never public links. No separate object store in Phase 1. |

### Deferred to later phases — **do not build in Phase 1**

| Service | Phase | Purpose |
|---------|-------|---------|
| WhatsApp provider (Meta Cloud API / AiSensy / Twilio) | Phase 2 | Notifications. **Decide during Phase 1C** — Meta template approval takes 3–7 days and must not block Phase 2. |
| Google Calendar API | Phase 2 | Auto-create events from meeting MoMs. |
| Google Drive API | Phase 2 | Export MoM summaries to `_BRAIN/MTG` folder. |
| VAPI.ai | Phase 3 | AI follow-up calls — purpose-built for AI calling. |

---

## 9. Repository & architecture

**One GitHub repo, two Railway services.** Supabase migrations versioned in the same repo.

```
meetup/
├── backend/                  # FastAPI (Python)
│   ├── main.py
│   ├── routers/
│   │   ├── auth.py           # OTP login, session checks
│   │   ├── recordings.py     # audio upload + pipeline job
│   │   ├── tasks.py          # task CRUD, status, dashboard
│   │   ├── extensions.py     # NEW: request/approve/deny deadline extensions
│   │   ├── meetings.py       # meeting records + MoM
│   │   ├── ideas.py          # idea save + retrieval
│   │   └── performance.py    # NEW: My Performance + Org Performance (leadership)
│   ├── services/
│   │   ├── assemblyai.py     # transcription (ported from CoachUp)
│   │   ├── claude.py         # 3 extraction prompts
│   │   └── supabase.py       # db client (service role)
│   ├── models/               # Pydantic schemas
│   └── requirements.txt
│
├── frontend/                 # Next.js
│   ├── app/
│   │   ├── page.tsx          # home dashboard
│   │   ├── delegate/         # task delegation flow
│   │   ├── meeting/          # meeting recording flow
│   │   ├── idea/             # idea capture flow
│   │   ├── received/         # Tasks Received (standalone)
│   │   ├── allocated/        # Tasks Allocated (standalone)
│   │   ├── meetings/         # past MoMs (standalone)
│   │   ├── performance/      # NEW: My Performance
│   │   └── org-performance/  # NEW: leadership-only dashboard
│   ├── components/
│   │   ├── RecordButton.tsx
│   │   ├── ReviewForm.tsx
│   │   ├── TaskCard.tsx
│   │   ├── ExtensionModal.tsx    # NEW
│   │   ├── ScoreCard.tsx         # NEW
│   │   └── Dashboard.tsx
│   └── lib/
│       └── supabase.ts       # client (anon key only)
│
└── supabase/
    └── migrations/           # all schema SQL, versioned
```

**Key separation:** the Supabase **service-role key lives only in the backend (Railway env vars)** — it bypasses RLS. The **frontend uses the anon key only.**

---

## 10. Phase 0 — Project setup

**Week 1 · Foundations.** ~8 weeks total to a usable product in the founder's hands.

### Build instructions

1. **Clone CoachUp; port (don't copy-paste) the pipeline.** Extract the recording UI, AssemblyAI client, and Claude call into clean reusable modules in the fresh MeetUp repo.
2. **Run all 7 table migrations** in Supabase: `companies`, `designations`, `users`, `tasks`, `task_extensions`, `meetings`, `ideas`. Include the additions: `tasks.completed_at`, `tasks.original_deadline`, the full `task_extensions` table, and `designations.capability_tier`.
3. **Enable RLS on every table immediately**, before any data is written. Add the `updated_at` Postgres trigger on `tasks`.
4. **Create the `user_performance` view** (on-time %, overdue count, totals, avg days-to-complete) with RLS: own-row for standard, all-rows for leadership tier.
5. **Scaffold FastAPI + Next.js on Railway.** Wire GitHub CI so lint + build pass on every push.
6. **Supabase Auth: email + OTP login** for a test user. Verify the frontend uses the **anon key**, never the service-role key.
7. **Seed script:** create companies (Ecoste/Lamora/Metamask), a couple of designations including one `leadership`-tier, and the founder account **seeded with the leadership tier**. Confirm no self-service path can set a leadership designation.

### 🚪 EXIT GATE — Phase 0
- [ ] Engineer can log in via OTP.
- [ ] All 7 tables exist with RLS enabled and correct foreign keys.
- [ ] `tasks` has `completed_at` + `original_deadline`; `task_extensions` exists; `designations.capability_tier` exists.
- [ ] `user_performance` view exists and returns correct shape.
- [ ] Railway deploys successfully from GitHub on push.
- [ ] Founder account is seeded with the leadership tier; no signup path can self-assign it.

### ✅ HUMAN CHECKPOINT
Manually try to log in. Open the Supabase table editor and confirm all 7 tables + the view. Confirm the frontend bundle does **not** contain the service-role key.

---

## 11. Phase 1A — The AI pipeline

**Weeks 2–3 · The core product.** This is where the most care goes.

### Build instructions

1. **Mic recording UI** (`RecordButton.tsx`): tap to start, tap to stop, waveform animation, red button + timer while recording. Handle browser mic permission and the **WebM (Chrome) / MP4 (Safari)** format difference.
2. **Async upload** to FastAPI → AssemblyAI (Hinglish model) → return transcript. Upload returns a **job ID immediately**; backend processes in background; frontend listens via **Supabase Realtime** on the row. Show a clear "Analysing your recording…" state during the 15–30s wait.
3. **Three Claude extraction prompts**, each with a strict JSON output schema:
   - **Task** → single object: `{ doer_name, description, deadline, report_to_name }`.
   - **Meeting** → `{ mom_summary, tasks: [ {doer_name, description, deadline, report_to_name}, ... ] }`.
   - **Idea** → `{ summary, tags: [...] }`.
4. **Review form** (`ReviewForm.tsx`) with auto-fill. Doer + Report To are **searchable dropdowns from `users`** showing the **Company** column, pre-set to Claude's best guess and correctable. Assignor is the logged-in user (locked).
5. **Missing-field gate:** if any of the four required fields (Doer, Description, Deadline, Report To) came back empty, highlight it red and **lock submit** until filled.
6. **On submit:** capture `original_deadline = deadline` at creation. For meetings, save each task as its own row linked via `meeting_id`, and run the missing-field check per task; the assignor reviews all tasks together in a scrollable list and submits the batch at once.

### 🚪 EXIT GATE — Phase 1A
- [ ] All 3 flows produce correct JSON from Hindi / English / Hinglish audio.
- [ ] Extraction accuracy above **85%** on 20 test recordings.
- [ ] Missing-field UI fires correctly when deadline or doer is absent.
- [ ] `original_deadline` is captured at creation and equals `deadline` initially.

### ✅ HUMAN CHECKPOINT
Record several real Hinglish clips yourself. Confirm the dropdowns disambiguate same-name people by company. Confirm a meeting recording produces multiple correct task rows linked to one meeting.

> **Phase 1 deliberately excludes:** WhatsApp notifications. The system stays fully in-app until extraction accuracy is proven.

---

## 12. Phase 1B — Views, dashboard, scoring

**Weeks 4–5 · Making it usable.**

### Build instructions

1. **Tasks Received & Tasks Allocated** as **standalone top-level views** (not nested in recording flows). Each shows all tasks regardless of source, with a `from meeting` / `direct` tag. **Server-side pagination + keyword search from the start** (a team lead may have 50+ open tasks at rollout). Status colours: teal = open/on-track, red = overdue, green = completed.
2. **Meetings view:** list of past meetings, each showing its MoM summary + count of tasks generated; tap to read full minutes.
3. **Mark task complete:** button on each card → sets `status = completed`, `completed_at = now()`; doer can optionally add a short completion note.
4. **Deadline renegotiation UI** (`ExtensionModal.tsx`):
   - Doer: "Request more time" on a received open task → reason + proposed deadline → creates `task_extensions` row (`requested`). Card shows "Extension requested".
   - Assignor: pending-extension badge on Tasks Allocated → Approve/Deny. Approve moves `tasks.deadline`, records `decided_by`/`decided_at`, and un-overdues the task if the new deadline is in the future.
5. **My Performance view** (`ScoreCard.tsx` + `performance/`): two metric cards (on-time % + overdue count) read from the `user_performance` view, plus totals, avg days-to-complete, and the user's extension history.
6. **Ideas view:** universal feed, filter by company + date, keyword search. (Ideas with no retrieval surface are useless.)
7. **Home dashboard:** four live count cards (given-open, received, completed, overdue) via Supabase Realtime — **no polling.**
8. **Mobile-responsive layout.** Test on a real Android (Chrome) and a real iPhone (Safari), including **mic permission persistence on iOS.**

### 🚪 EXIT GATE — Phase 1B
- [ ] Dashboard counts accurate and update in real time.
- [ ] **RLS confirmed:** a user cannot see another company's tasks (test with a non-admin user).
- [ ] My Performance shows correct on-time % and overdue count; an **approved** extension visibly protects the score.
- [ ] Extension request → approve/deny flow works end to end with audit fields populated.
- [ ] Works correctly on real mobile browsers.

### ✅ HUMAN CHECKPOINT
Create a task, miss the deadline (so it goes overdue), request + approve an extension, complete it, and confirm the doer's on-time % was **not** penalised. Then complete a different task late with no extension and confirm it **was** counted against the score. This proves the fairness mechanism.

---

## 13. Phase 1C — Pilot & stabilise

**Weeks 6–8 · Real-world proof.**

### Build instructions

1. **Seed pilot accounts:** founder's office + 1–2 team leads. Run real meetings and real task delegations through the system **daily.**
2. **Minimal leadership dashboard** (`org-performance/` + `performance.py`): the Org Performance view, gated on `capability_tier = 'leadership'`, searchable by name/email, showing on-time %, overdue count, task volume per employee across all three companies. **Scores + counts only.** Backend RLS + conditional frontend rendering both enforced.
3. **Measure extraction accuracy** on real recordings — especially deadline parsing, doer identification, and Hinglish handling.
4. **Two full rounds of bug fixes** from pilot feedback.
5. **Build error states:** what the user sees if AssemblyAI fails, if Claude returns bad JSON, or if upload times out. User can re-record or edit a raw transcript manually.
6. **Submit WhatsApp message templates to Meta now (Week 6)** — approval takes 3–7 days and can be rejected; must not block Phase 2.
7. **Decide the WhatsApp provider** (Meta Cloud API / AiSensy / Twilio) during this phase.

### 🚪 EXIT GATE — Phase 1C — **HARD GATE (Phase 2 is BLOCKED until all pass)**
- [ ] Extraction accuracy above **90%** on real pilot recordings.
- [ ] Schema stable — **no structural changes** needed after 2 weeks of real use.
- [ ] Pilot users actively using the tool, **not reverting to WhatsApp.**
- [ ] WhatsApp templates submitted to Meta for approval.
- [ ] Leadership dashboard verified: a standard-tier user **cannot** access Org Performance (tested via direct API call, not just hidden UI).

### ✅ HUMAN CHECKPOINT
You personally try to reach the Org Performance endpoint while logged in as a standard user — it must be **rejected by the backend**, not merely hidden. Confirm the founder account sees all three companies' scores and search works by name and email.

> **Phase 1 deliberately does NOT include:** WhatsApp notifications · calendar automation · Google Drive export · Sheets mirror · AI calling agent · any autonomous action. Every record is confirmed by the person who hits submit. The reason is deliberate: validate AI accuracy on a small supervised pilot before the system is ever trusted to message or call 200–300 people unsupervised.

---

## 14. Phase 2 — Org-wide rollout & automation

**Weeks 9–15 · ~7 weeks.** Detailed planning happens **only after Phase 1's hard gate is cleared.** Summarised here for context.

### Scope

1. **WhatsApp layer:** task notification on creation; deadline reminder 24h before; overdue alert; completion notification to the report-to person. **Also: extension-decision notifications** (doer notified on approve/deny; report-to/assignor kept in the loop).
2. **Pending Actions screen:** an in-app review surface where a person can **edit or cancel any system-initiated message before it goes out.** No autonomous sends — ever.
3. **Calendar & Brain:** Google Calendar events from meeting MoMs; MoM export to `_BRAIN/MTG` Drive folder; a read-only Google Sheets mirror for non-technical browsing.
4. **Full rollout:** bulk user seeding across all three companies; **designation-tier feature gating** (the broader version — multiple tiers, more gated features, built on the `capability_tier` foundation from Phase 1); formal sunset of WhatsApp for task delegation.
5. **Self-signup (deferred from Phase 1):** the name / company (dropdown) / email / phone / designation form. **Crucially: the designation dropdown excludes all leadership-tier designations, and the backend rejects any attempt to self-assign a leadership tier.** Leadership remains assigned by admin only.
6. **(Optional, decide explicitly) leadership drill-down:** if wanted, allow the leadership tier to view individual task content — a deliberate privacy decision, not a default.

### Security carried forward
- No PII in WhatsApp: keep messages generic ("You have a new task — open MeetUp to view"); deep-link to the app; never paste full task text into WhatsApp.

---

## 15. Phase 3 — AI calling & full autonomy

**Weeks 16–19 · ~3–4 weeks.** Built on everything proven before it.

### Scope

1. **VAPI.ai calling agent:** AI follow-up calls when a task is overdue — **always gated through the same Pending Actions approval screen** built in Phase 2. Never autonomous.
2. **Call transcripts stored in Supabase** for a full audit trail.
3. **Leadership tier only:** AI-drafted outbound messages and more proactive calendar control — not rolled out to everyone. (Uses the same `capability_tier` gate.)

> **Realistic timeline to full Phase 3:** ≈ 19 weeks. Usable product in the founder's hands after Phase 1: ≈ 8 weeks from first commit.

---

## 16. Success metrics

Three layers: technical accuracy proves the AI works; adoption proves people use it; business outcome proves it solves the real problem.

### Technical (pilot)
- Deadline extracted correctly — target **90%+**
- Doer matched to correct user — target **85%+**
- Hinglish transcription accuracy — test 20 clips before going wider
- Transcription latency — under **30s** for 2-min audio

### Adoption (post-rollout)
- Weekly active users — target **60%+** of registered in month 1
- Tasks created per week — should trend up, not plateau
- Task completion rate — are open tasks getting closed?
- Ideas captured per week — is the habit forming?

### Business (60–90 days)
- Fewer "I forgot" / "nobody told me" incidents
- Avg days from task creation to completion — going down?
- MoMs written vs meetings held — ratio improving?
- % of tasks completed before deadline

### New (scoring layer)
- **On-time completion rate trend** per team — improving over the pilot?
- **Extension-request rate** — are deadlines being set realistically? (A flood of extensions = deadlines too aggressive; near-zero with high overdue = mechanism not being used.)

### Metric to deliberately avoid
Do **not** measure success by the raw number of ideas captured — it measures activity, not value. What matters is whether ideas get acted on (a Phase 3 conversation).

### Define "extraction accuracy" before the pilot
Agree the exact definition before testing: deadline parsed correctly **+** doer matched to the right user **+** task description sensible. Without a clear definition the pilot has no pass/fail.

---

## 17. Locked decisions

The developer does not need to ask about any of these.

| Decision | Answer |
|----------|--------|
| Where do task lists live? | Standalone top-level views (Tasks Received / Allocated), not nested in recording flows. Show all tasks from both sources. |
| How do you tell a meeting task apart? | Each card shows a `direct` / `from meeting` tag driven by the existing `source` field. No schema change. |
| Where do past MoMs live? | Standalone Meetings view (built Phase 1B). |
| Who is the assignor? | Always the logged-in user. No "on behalf of" mode. |
| How is the doer selected? | Dropdown of all employees; Claude pre-fills its best guess; assignor corrects if wrong. |
| What shows in the dropdown? | Name + Company (disambiguates same-name people across companies). |
| What does "Report To" mean? | The person the doer reports completion to. In Phase 2 they also get a done-notification. |
| Which fields are mandatory? | Doer, Task Description, Deadline, Report To. Submit locked until all four are filled. |
| Who sees which tasks? | Each user sees only their own received/allocated tasks. Enforced by RLS in Postgres. |
| Who sees ideas? | All employees, all companies. Universal feed with a company filter. |
| Is idea retrieval in Phase 1? | Yes — Phase 1B. |
| What auth method? | Email + OTP via Supabase Auth. |
| Where does recording audio go? | Supabase Storage, signed URLs, 90-day retention. Never public URLs. |
| What happens when someone leaves? | `is_active = false` (soft delete). Their tasks remain intact — no cascade failures. |
| When does WhatsApp approval start? | Phase 1C (Week 6) — Meta approval takes 3–7 days. |
| Max recording length? | ~5 min for task delegation, ~30 min for meetings. UI enforces the limit. |
| What if extraction fails? | Clear error; user can re-record or edit a raw transcript manually. Error states built in Phase 1C. |
| **How is a doer scored?** | **Derived live from `tasks` (never stored). Two metrics: on-time completion % + current overdue count.** |
| **What protects a doer's score from a real bottleneck?** | **An approved deadline extension. The score judges against the current deadline; an approved extension moves it, so no penalty. Approval (not the claim) is what protects.** |
| **Who can see all employees' scores?** | **Only `capability_tier = 'leadership'`. Searchable by name/email. Scores + counts only in Phase 1.** |
| **How is leadership access granted?** | **By seeding/admin only — never self-selected. Signup dropdown excludes leadership tiers; backend rejects self-assignment; RLS reads the verified stored tier. Self-claiming CEO is structurally impossible.** |

---

## 18. Security checklist

Read before writing any auth or data code.

| Rule | How to implement |
|------|------------------|
| Never commit secrets | Git-ignored `.env` locally; Railway env vars in production. No exceptions, even for "temporary" keys. |
| Service-role key: backend only | The Supabase service-role key bypasses all RLS. It lives only in Railway env vars. The frontend uses the anon key. |
| RLS before any data | Enable RLS on all tables in Postgres before the pilot. Test with a non-admin user. Core rule: a user reads/writes only rows scoped to them (own tasks; own company where relevant). |
| Leadership exception is scoped | The only cross-company read is the `user_performance` view, gated on the verified `capability_tier = 'leadership'`. Nothing else crosses company boundaries. |
| No self-elevation | No signup/profile path can set a leadership-tier `designation_id`. Enforced in UI (dropdown filtered) **and** backend (request rejected) **and** RLS (reads verified tier). |
| Audio access control | Store audio with RLS matching the meetings table. Signed URLs with expiry for playback — never public URLs. |
| No PII in WhatsApp (Phase 2) | Keep messages generic ("You have a new task — open MeetUp to view"). Deep-link to the app; never paste full task text into WhatsApp. |

### Immediate next steps (in order)
1. Read this document fully — especially Locked Decisions (§17) and the access-control model (§7).
2. Get Supabase credentials (secure channel — never email or WhatsApp).
3. Clone CoachUp; extract the pipeline as clean modules.
4. Run the 7 schema migrations + `updated_at` trigger + `user_performance` view; enable RLS immediately.
5. Scaffold app + auth (Next.js + FastAPI on Railway, email-OTP, anon key in frontend).
6. Build the three flows (Task Delegation → Meeting Recording → Idea, in that order). Test each with real Hinglish audio.
7. Build views, dashboard, scoring, and the extension flow. Mobile-responsive from day one.
8. Pilot, measure, fix. Clear the hard gate before any Phase 2 work.

### The single most important principle
Phase 1 proves the AI is trustworthy on a small, supervised group before the system is ever allowed to message or call people automatically. Get extraction accuracy right first. Everything else — WhatsApp, calendar, calling, autonomy — is built on that foundation. If the foundation is shaky, nothing above it can be trusted.

---

## 19. Glossary

- **MoM** — Minutes of Meeting; Claude's structured summary of a recorded meeting.
- **Doer / assignee** — the person responsible for completing a task.
- **Assignor** — the person who created/delegated the task (always the logged-in recorder).
- **Report To** — the person the doer reports completion to.
- **Hinglish** — the natural Hindi/English code-mix the organisation speaks.
- **RLS** — Row-Level Security; access rules enforced inside Postgres.
- **`capability_tier`** — the field on `designations` that gates feature access (`standard` / `leadership`).
- **Derived score** — performance computed live from the `tasks` table, never stored as a column.
- **Approved extension** — a deadline change approved by the assignor; the only thing that protects a doer's score from a genuine bottleneck.
- **Hard gate** — a checkpoint that fully blocks the next phase until every criterion passes.

---

*MeetUp — Build Plan. Confidential — Founder's Office. Phase 1 ≈ 8 weeks · Full Phase 3 ≈ 19 weeks.*
