# MeetUp

**Voice-first internal operations platform.** Tap a button, speak in Hindi / English / Hinglish, and the system transcribes it, structures it, shows it back for confirmation, and routes it to the right people.

Three things you can capture:

| | |
|---|---|
| 🎤 **Delegate a task** | one recording → one task with a doer, deadline and report-to |
| 📋 **Record a meeting** | one recording → minutes + a task for each person mentioned |
| 💡 **Store an idea** | one recording → a summary and tags, visible org-wide |

Plus: task lists, derived performance scores, deadline renegotiation, a leadership dashboard, and an admin screen for adding employees.

Built for **Ecoste**, **Lamora** and **Metamask** (~200–300 employees). Internal use only — there is no public signup.

> The full specification and current build status live in **`.claude/plan.md`**. Read that before changing anything.

---

## How it's built

```
Browser  ──►  Next.js app  ──►  Supabase (Postgres + Auth + Storage + Realtime)
                   │
                   └──►  AssemblyAI (speech-to-text)  ──►  Claude (structuring)
```

One Next.js project. One deploy. No separate backend service.

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router) · React 19 · Tailwind 4 · TypeScript |
| Hosting | Vercel — fully serverless, no always-on server |
| Data / Auth / Storage / Realtime | Supabase |
| Speech-to-text | AssemblyAI (submit + webhook, language auto-detect) |
| AI structuring | Claude (`claude-opus-4-8`) — Claude only, no OpenAI |

### The repo root *is* the app

There is no `frontend/` folder, because that name would be wrong — the same project holds the backend.

```
meetup/
├── app/
│   ├── (app)/          🌐 runs in the browser — the UI pages
│   └── api/            🔒 runs on the server — 25 route handlers = the backend
├── components/         🌐 runs in the browser
├── lib/
│   ├── api.ts          🌐 browser → /api calls
│   └── server/         🔒 server only — DB admin client, auth, Claude, AssemblyAI
├── supabase/           database schema + setup (see supabase/README.md)
├── public/
└── .claude/plan.md     the spec and build status
```

**🌐 vs 🔒 is the thing to understand.** Both live in one project, but Next.js sends them to different places:

- **🌐 browser code** is downloaded by the user. Assume it is fully public and editable.
- **🔒 server code** never leaves Vercel. `app/api/**` is never bundled for the browser, every file in `lib/server/` imports `'server-only'` so the **build fails** if browser code imports it, and only `NEXT_PUBLIC_*` environment variables are baked into browser JavaScript.

Which is why the security rule is: **the browser decides what is *shown*; the server decides what is *allowed*.** A user can edit the browser code to unhide the leadership menu and gets nothing — `/api/leadership/*` re-checks their permission tier in the database on every request.

---

## Running it locally

**You need:** Node 20+, a Supabase project, an Anthropic API key, an AssemblyAI API key.

### 1. Clone and install

```bash
git clone https://github.com/pankaj-ecoste/meetup.git
cd meetup
npm install
```

### 2. Set up the database

Follow **[`supabase/README.md`](supabase/README.md)** — run `supabase/setup.sql` on a fresh Supabase project, enable Realtime, and create the first leadership user.

### 3. Add your keys

```bash
cp .env.example .env.local
```

Then fill in the values. `.env.example` explains where each one comes from and which are safe to expose.

### 4. Start it

```bash
npm run dev
```

Open **http://localhost:3000**. There is no second service to start.

### 5. Log in

Go to **`/claim`**, pick your name, enter the code emailed to you, and set a password. After that it's just email + password at `/login`.

> **One limitation locally:** AssemblyAI cannot call back to `localhost`, so **recording does not complete on a local machine** — the job will sit at "Transcribing". Everything else works fine. To test recording, use a deployed Vercel preview URL, which has a public address AssemblyAI can reach.

---

## Deploying

Deploys to **Vercel** with no configuration file.

1. Import the repo in Vercel.
2. **Root Directory: leave blank** (the app is at the repo root).
3. Add every variable from `.env.example` under **Settings → Environment Variables**. Only the `NEXT_PUBLIC_*` ones are exposed to browsers; the rest stay server-side.
4. Deploy.

⚠️ **Turn Deployment Protection OFF** (Settings → Deployment Protection). If it's on, AssemblyAI's webhook is rejected with a 401 before it reaches the app and **recordings silently never finish**. This has bitten this project before.

---

## Commands

| | |
|---|---|
| `npm run dev` | development server |
| `npm run build` | production build |
| `npm start` | serve a production build |
| `npm run lint` | ESLint |

---

## If you're changing the code

1. **Read `.claude/plan.md` first.** It is the single source of truth — spec, current state, and planned work in one file. Write your change into its §8 *before* building it.
2. **This is not the Next.js you may know.** Version 16 has breaking changes versus most training data and tutorials. Check `node_modules/next/dist/docs/` before writing route handlers or convention-based files. (That's why the middleware file here is `proxy.ts`.)
3. **Every new API route handler must call `requireUser()`.** Handlers use the Supabase service-role key, which bypasses Row Level Security — so the handler is responsible for verifying the caller and scoping its own query. Forgetting this exposes data.
4. **Never put a secret behind a `NEXT_PUBLIC_` prefix.** That publishes it to every browser.

---

*Internal software — Founder's Office. Not for public distribution.*
