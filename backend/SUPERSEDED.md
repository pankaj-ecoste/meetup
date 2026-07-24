# ⚠️ This backend is SUPERSEDED — do not deploy

As of the serverless build (`.claude/plan.md` §0 & §9.1, 2026-07-24), this
FastAPI service is **retired**. Its logic was reimplemented 1:1 as **Next.js
Route Handlers** inside `frontend/app/api/*`, and the recording pipeline was
rebuilt from poll-and-wait into **submit + AssemblyAI webhook**.

The whole app now runs **fully serverless on Vercel + Supabase** — there is no
always-on server. Railway and Render were both dropped (their `railway.toml` /
`render.yaml` deploy configs were removed in the same change).

**Where the logic lives now:**

| Old (`backend/`) | New (`frontend/`) |
|---|---|
| `routers/auth.py` | `app/api/auth/me/route.ts` + `lib/server/auth.ts` (`requireUser`) |
| `routers/users.py` | `app/api/users/route.ts` |
| `routers/tasks.py` | `app/api/tasks/**` + `lib/server/tasks.ts` |
| `routers/meetings.py` | `app/api/meetings/**` |
| `routers/ideas.py` | `app/api/ideas/route.ts` |
| `routers/extensions.py` | `app/api/extensions/**` |
| `routers/performance.py` | `app/api/performance/**` |
| `routers/recordings.py` | `app/api/recordings/{upload,webhook}/route.ts` |
| `services/extraction.py` | `lib/server/claude.ts` |
| `services/assemblyai.py` | `lib/server/assemblyai.ts` (submit + webhook) |
| `services/supabase.py` | `lib/server/supabaseAdmin.ts` |

Kept in git history for reference only. `generate_login_link.py` (admin
magic-link fallback) still works standalone if ever needed.
