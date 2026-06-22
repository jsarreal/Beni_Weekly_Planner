# Beni's Weekly Planner — Session Handoff

**Last updated:** 2026-06-21
**Branch:** `phase1-foundations` (HEAD `bc13bf1`) — **not yet merged to `main`**
**Status:** Phase 1 (Foundations) COMPLETE & verified (17/17 tests, `tsc --noEmit` clean, final whole-branch review passed). Phases 2–5 not started.

> This file is written to be picked up by a fresh session — Claude or Gemini. Where it
> says "subagent" / "skill", use your platform's equivalent (Gemini: `activate_skill`,
> dispatch agents, etc.). The work itself is platform-agnostic.

---

## 1. The Goal

Build a **hosted web app** (single user — the owner, john.sarreal@gmail.com) that connects
to Google Calendar and **auto-schedules time blocks** to accomplish recurring **habits** and
deadline-driven **goals**. It continuously re-plans as the calendar changes, and a daily
**LLM agent** reviews progress, emails + shows an in-app summary, and reprioritizes/reschedules
upcoming days.

**Read these two documents first — they are the source of truth:**
- Design spec: `docs/superpowers/specs/2026-06-21-weekly-planner-design.md`
- Phase 1 plan: `docs/superpowers/plans/2026-06-21-phase1-foundations.md`

---

## 2. Confirmed product decisions (do NOT re-litigate)

| Decision | Choice |
|---|---|
| Platform | Hosted web app, single user |
| Calendar write target | **Primary** Google Calendar (planner events tagged via extended property `private.beniPlanner="1"` so the app only ever touches its own events) |
| Item types | **Habits** = recurring (freq + duration; sleep is a special habit type). **Goals** = projects with deadline + total effort, split into sessions |
| Scheduling | **Auto-schedule** (writes blocks directly), hands-off |
| Constraints | sleep/wake blocks, awake/working hours (per-day), avoid existing events, per-item time-of-day prefs |
| Re-plan cadence | **Continuous** (watch calendar, re-plan on change) |
| Scheduling brain | **Approach A**: deterministic engine in code + LLM only as advisor for the daily review |
| Daily review delivery | **Email + in-app** |
| Progress input | Inferred from calendar **+** user corrections |
| Daily agent | **LLM-agnostic** runner (see §6) — OpenRouter + agy + fake |

**Open defaults (chosen, changeable):** 15-min buffers; max 4 goal-hrs/day (sleep+habits
excluded); goals scheduled only enough to hit deadline + margin (not greedy); habits spread
evenly; weekends governed by per-day windows; agent review evening (18:00 local) only;
agent may freely (re)schedule next 7 days + apply priority adjustments, reported in summary;
14-day rolling planning window; 15-min sync tick.

---

## 3. Tech stack & key engineering decisions

- **Next.js 15 (App Router) + TypeScript (strict)**, deployable on Vercel.
- **Vitest** for tests. TDD throughout.
- **Prisma ORM, but PRISMA v7** — this matters:
  - `url` lives in `prisma.config.ts` (NOT in `schema.prisma`'s datasource block).
  - v7 PrismaClient **requires a driver adapter**. Dev/test uses `@prisma/adapter-better-sqlite3`.
  - See `AGENTS.md`: "This is NOT the Next.js you know" — check `node_modules/next/dist/docs/`
    and Prisma's actual installed-version docs before assuming APIs.
- **Datastore: SQLite for dev/test, Postgres for prod.** No local Postgres/Docker was
  available, so we chose SQLite. Because SQLite has no scalar-list type, **all list/JSON
  fields are stored as JSON-encoded `String` columns** (`Settings.dayWindows`,
  `Settings.blackoutDays`, `Habit.fixedDays`, `DailyReview.adjustments`). The service layer
  parses/serializes them. This is portable to Postgres unchanged.
  - **`lib/db.ts` currently THROWS on any non-`file:` DATABASE_URL** (loud failure). Wiring
    real Postgres requires adding `@prisma/adapter-pg` and a branch in `createClient()` — a
    deliberate deferred task (see §7).
- **Token security:** Google OAuth tokens are AES-256-GCM encrypted at rest
  (`lib/crypto.ts`, key from `APP_ENCRYPTION_KEY`). The settings API strips
  `googleRefresh`/`googleAccessTok`/`googleTokenExp` from all responses.
- **Google creds: mocked for now.** Real `GOOGLE_CLIENT_ID/SECRET` not yet provided — unit
  tests mock `googleapis`. Live connect needs real credentials added to `.env`.

---

## 4. What exists (Phase 1, all committed on `phase1-foundations`)

```
app/api/auth/google/route.ts            GET → 302 to Google consent
app/api/auth/google/callback/route.ts   GET → exchange code → 302 /?connected=1 (missing code → /?error=missing_code)
app/api/settings/route.ts               GET/PUT settings (token fields stripped; PUT 400 on invalid)
app/page.tsx                            minimal home: connection status + "Connect Google Calendar" link
lib/db.ts                               Prisma v7 singleton w/ better-sqlite3 adapter; throws on non-sqlite URL
lib/settings.ts                         getSettings()/updateSettings() (single Settings row id=1; JSON-string cols)
lib/validation.ts                       Zod: dayWindowSchema, settingsSchema (agentProvider enum: openrouter|agy|fake)
lib/crypto.ts                           encrypt()/decrypt() AES-256-GCM
lib/google/oauth.ts                     getAuthUrl()/exchangeCode()/getAuthedClient() — encrypted token storage + refresh
prisma/schema.prisma                    Settings, Habit, Goal, Block, DailyReview (SQLite)
prisma/migrations/.../init              committed migration
tests/*                                 17 tests across 7 files, all passing
```

**Commits:** `git log --oneline 9b0961d..HEAD` (13 commits, scaffold → data model → settings
→ crypto → OAuth client → OAuth routes → settings route/UI → review fixes).

---

## 5. How to run / verify

```bash
cd "/Users/johnsarreal/Beni's Weekly Planner"
# .env needs at least: DATABASE_URL="file:./dev.db"  and  APP_ENCRYPTION_KEY (32 bytes base64: openssl rand -base64 32)
npm install
npx prisma generate
npm test            # expect: 7 files, 17 tests passing
npx tsc --noEmit    # expect: no errors
npm run dev         # http://localhost:3000 — shows "Not connected" + connect link (live connect needs real Google creds)
```

`.env.example` lists every required var. `.env` and `dev.db` are gitignored.

---

## 6. The LLM-agnostic daily agent (Phase 5) — design is locked, not yet built

Emulates the runner abstraction in
`/Users/johnsarreal/sarreal-personal/AI_Native_SDLC/feedback-app/app/agent/`:
- `runner.py` — a `Protocol` (`AgentRunner`) + `FakeAgentRunner` for tests.
- `api_runner.py` — `ApiAgentRunner` hitting an **OpenAI-compatible** chat-completions API
  (messages/tools/`choices[0].message`). This is the **OpenRouter** shape.
- `claude_runner.py` — `ClaudeCodeRunner` shelling out to a CLI.

Port to TypeScript: an `AgentRunner` interface + `OpenRouterRunner` (OpenAI-compatible HTTP),
`AgyRunner` (**agy = Google's Antigravity CLI** → CLI-runner shape, write a result JSON & read
it back), and `FakeAgentRunner`. Provider chosen by env (`AGENT_PROVIDER`). Spec §7.1 has the
full detail.

---

## 7. Tracked tech debt / deferred follow-ups (from the final review — none are Phase-1 blockers)

- **`@prisma/adapter-pg` not wired.** `lib/db.ts` throws on non-sqlite URLs. Needed before any
  Postgres deployment.
- **Crypto:** tamper/wrong-key negative tests were ADDED (done). ✅
- **Schema test** covers only `Habit` CRUD — add a `Block`→Habit/Goal `onDelete: Cascade` test
  when Phase 2 creates real Blocks. The cascade is load-bearing for the planner.
- **`updateSettings`** uses findUnique+create+update (no transaction) — consider `upsert` for
  atomicity (harmless for single-user).
- `app/layout.tsx` still has the scaffold default `title: "Create Next App"` — rename.

---

## 8. Roadmap — remaining phases (each gets its own plan doc, then build)

- **Phase 2 — Scheduling engine + calendar write:** pure `plan(items, constraints, existingEvents, window) → desiredBlocks[]`
  (TDD: free-slot computation, priority placement, deadline backsolving, sleep/wake fixed
  blocks, no double-booking, buffers). Plus `lib/google/calendar.ts` create/update/delete with
  planner tagging, and a **diff/reconcile** step. → blocks appear on the primary calendar.
- **Phase 3 — Habit/Goal management UI + weekly view.**
- **Phase 4 — Continuous sync + reconcile:** Google `syncToken` incremental sync, ~15-min cron
  tick, re-plan trigger, full-resync fallback.
- **Phase 5 — Daily agent:** the §6 runner abstraction + daily cron review + email (Gmail) +
  in-app review screen; adjustments feed the engine.

---

## 9. Immediate next actions for the next session

1. **Finish the Phase 1 branch.** The owner chose **"Push + open PR"**, but it's blocked:
   **`gh` CLI is not installed and there is no git remote.** `brew` IS available
   (`/opt/homebrew/bin/brew`), `git` credential helper is `osxkeychain`. Options to resolve:
   `brew install gh && gh auth login` then `gh repo create` + push + PR; OR have the owner
   create a GitHub repo and provide the remote URL; OR fall back to merging `phase1-foundations`
   into `main` locally. **Confirm with the owner before creating any GitHub repo** (public vs
   private is their call — default to private).
2. **Then plan Phase 2** (scheduling engine) using the writing-plans workflow, and execute it
   the same way Phase 1 was done (subagent-driven: fresh implementer per task → per-task
   spec+quality review → fix loop → final whole-branch review).

---

## 10. Process notes (how Phase 1 was built — reuse this)

- Workflow used: brainstorming → writing spec → writing plan → **subagent-driven-development**
  (one implementer subagent per task with full task brief; a reviewer subagent per task; fix
  subagents for Critical/Important findings; one final whole-branch review on the most capable
  model) → finishing-a-development-branch.
- A durable progress ledger lives at `.superpowers/sdd/progress.md` (gitignored scratch) with
  every task's commit range and deferred findings. Task briefs/reports/diffs are there too.
- Model selection that worked: mechanical/transcription tasks → cheap model; integration tasks
  → standard; final review → most capable.
- **Always run the actual tests and `tsc --noEmit` before claiming done.** Don't trust reports.
```
