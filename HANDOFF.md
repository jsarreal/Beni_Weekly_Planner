# Beni's Weekly Planner — Session Handoff

**Last updated:** 2026-06-21
**Branch:** `phase2-engine` (HEAD `8fb5d49`) — **pushed to origin, pending merge to `main`**
**Status:** 
- Phase 1 (Foundations) + Supabase/Postgres Configuration merged into `main` and verified.
- Phase 2 (Scheduling Engine & Google Calendar Write) is COMPLETE and verified on `phase2-engine` branch (29/29 tests passing, `tsc --noEmit` clean).
- Phases 3–5 not started.

---

## 1. The Goal

Build a **hosted web app** (single user — the owner, john.sarreal@gmail.com) that connects to Google Calendar and **auto-schedules time blocks** to accomplish recurring **habits** and deadline-driven **goals**. It continuously re-plans as the calendar changes, and a daily **LLM agent** reviews progress, emails + shows an in-app summary, and reprioritizes/reschedules upcoming days.

**Read these two documents first — they are the source of truth:**
- Design spec: `docs/superpowers/specs/2026-06-21-weekly-planner-design.md`
- Phase 1 plan: `docs/superpowers/plans/2026-06-21-phase1-foundations.md`

---

## 2. Confirmed Product Decisions (do NOT re-litigate)

| Decision | Choice |
|---|---|
| Platform | Hosted web app, single user |
| Database | **SQLite** for local dev/test; **Supabase (PostgreSQL)** for production. |
| Calendar write target | **Primary** Google Calendar (planner events tagged via extended property `private.beniPlanner="1"` so the app only ever touches its own events) |
| Item types | **Habits** = recurring (freq + duration; sleep is a special habit type). **Goals** = projects with deadline + total effort, split into sessions |
| Scheduling | **Auto-schedule** (writes blocks directly), hands-off |
| Constraints | sleep/wake blocks, awake/working hours (per-day), avoid existing events, per-item time-of-day prefs |
| Re-plan cadence | **Continuous** (watch calendar, re-plan on change) |
| Scheduling brain | **Approach A**: deterministic engine in code + LLM only as advisor for the daily review |
| Daily review delivery | **Email + in-app** |
| Progress input | Inferred from calendar **+** user corrections |
| Daily agent | **LLM-agnostic** runner — OpenRouter + agy + fake |

---

## 3. Tech Stack & Key Engineering Decisions

- **Next.js 15 (App Router) + TypeScript (strict)**, deployable on Vercel.
- **Vitest** for tests. TDD throughout.
- **Prisma ORM, v7**:
  - v7 PrismaClient **uses driver adapters**. 
  - Dynamic Client Ingestion: `lib/db.ts` dynamically requires and loads either `@prisma/adapter-better-sqlite3` (for SQLite) or `@prisma/adapter-pg` (for PostgreSQL/Supabase) depending on the environment's `DATABASE_URL` protocol.
  - A build-time script (`scripts/prepare-db.js`) automatically rewrites the datasource provider in `prisma/schema.prisma` before generating the client.
- **Token security**: Google OAuth tokens are AES-256-GCM encrypted at rest (`lib/crypto.ts`, key from `APP_ENCRYPTION_KEY`).

---

## 4. What Exists (Phase 1 & 2 Complete)

```
scripts/prepare-db.js                  Build-time script to set schema.prisma provider
app/api/auth/google/route.ts            GET → 302 to Google consent
app/api/auth/google/callback/route.ts   GET → exchange code → 302 /?connected=1
app/api/settings/route.ts               GET/PUT settings (tokens stripped)
app/page.tsx                            minimal home: connection status + oauth link
lib/db.ts                               Prisma v7 singleton with dynamic adapter switcher
lib/settings.ts                         getSettings()/updateSettings()
lib/validation.ts                       Zod schemas
lib/crypto.ts                           encrypt()/decrypt() AES-256-GCM
lib/engine.ts                           Deterministic scheduling engine (TDD verified)
lib/reconcile.ts                        Delta reconciliation engine (prevents calendar churn)
lib/google/oauth.ts                     Google OAuth client with token refresh
lib/google/calendar.ts                  Calendar v3 client filtering by private tags
prisma/schema.prisma                    Database schema (Settings, Habit, Goal, Block, DailyReview)
tests/*                                 29 tests across 10 files, all passing
```

---

## 5. How to Run / Verify

```bash
cd "/Users/johnsarreal/Beni's Weekly Planner"
# Ensure .env is populated (see .env.example)
npm install
npm test            # expect: 10 files, 29 tests passing
npx tsc --noEmit    # expect: no errors
npm run dev         # runs local Next.js dev server with sqlite
```

---

## 6. Next Steps (Phase 3)

1. **Merge Phase 2**: Merge `phase2-engine` into `main` locally once the code is reviewed.
2. **Phase 3 — Habit/Goal management UI + weekly view**:
   - Create React components and pages to CRUD Habits and Goals.
   - Build a weekly calendar view displaying the scheduled blocks dynamically fetched from calendar/database.
