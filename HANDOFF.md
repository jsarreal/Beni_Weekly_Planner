# Beni's Weekly Planner — Handoff

**Last updated:** 2026-06-22
**Branch:** `main`
**Status:** 
- All 5 Phases of the implementation plan are **COMPLETE**, verified, and merged into `main`.
- 39/39 tests across 14 test files are passing successfully.
- `npx tsc --noEmit` type-checks clean.

---

## 1. Project Overview

Beni's Weekly Planner is a single-user hosted web app designed to auto-schedule habits (recurring tasks) and goals (deadline-driven projects split into sessions) directly on the user's primary Google Calendar. 
It features:
- A deterministic calendar scheduler engine prioritizing habits and goals.
- Incremental syncing that replans when calendar events change.
- A daily LLM agent (coaching advisor) that reviews progress, logs completions, updates goal priority/completed progress in the DB, and emails recaps via the user's Gmail.
- A modern dark-mode responsive glassmorphic dashboard.

---

## 2. Project Structure

```
app/api/auth/google/route.ts            GET → Redirects to Google Consent Screen
app/api/auth/google/callback/route.ts   GET → Code exchange, encrypts and stores refresh tokens
app/api/settings/route.ts               GET/PUT settings (re-plans on save)
app/api/habits/route.ts                  GET/POST CRUD habits (re-plans on create)
app/api/habits/[id]/route.ts            PUT/DELETE CRUD habits (re-plans on change)
app/api/goals/route.ts                  GET/POST CRUD goals (re-plans on create)
app/api/goals/[id]/route.ts             PUT/DELETE CRUD goals (re-plans on change)
app/api/blocks/route.ts                 GET calendar blocks for range queries
app/api/blocks/[id]/route.ts            PUT to manually toggle status (done, skipped, etc.)
app/api/reviews/route.ts                GET all daily reviews
app/api/reviews/[id]/route.ts           PUT to update user coaching feedback
app/api/schedule/route.ts               POST to manually trigger a re-plan run
app/api/sync/route.ts                   GET/POST to run incremental calendar sync
app/api/cron/daily-review/route.ts      GET/POST to trigger daily coaching review
app/page.tsx                            Sleek dashboard UI (Calendar, Habits, Goals, Reviews, Settings)
lib/db.ts                               Prisma v7 dynamic SQLite/Postgres adapter
lib/crypto.ts                           AES-256-GCM token encryption
lib/settings.ts                         Settings service layer
lib/engine.ts                           Deterministic scheduling logic
lib/reconcile.ts                        Google calendar diff engine
lib/scheduler.ts                        Orchestrates sync between planning engine, DB, and Google Calendar
lib/sync.ts                             Incremental sync engine using syncToken and 410 fallbacks
lib/agent/runner.ts                     Agent runner factory (Fake, Agy, OpenRouter) and prompt compiler
lib/agent/review.ts                     Agent daily review coordinator (DB updates + Gmail dispatch)
lib/google/oauth.ts                     OAuth connection and auto token refresh
lib/google/calendar.ts                  Google Calendar API helpers
lib/google/gmail.ts                     Gmail sender helper
tests/*                                 39 tests across 14 test files, all passing
```

---

## 3. Running & Verifying

### Environment Setup
Make sure the `.env` file contains your Google OAuth credentials and the encryption key:
```
DATABASE_URL="file:./dev.db"
APP_ENCRYPTION_KEY="<32-byte-base64>"
GOOGLE_CLIENT_ID="<your-google-client-id>"
GOOGLE_CLIENT_SECRET="<your-google-client-secret>"
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"
APP_BASE_URL="http://localhost:3000"

# Daily review agent config
AGENT_PROVIDER="fake" # 'fake', 'agy', or 'openrouter'
OPENROUTER_API_KEY="<your-openrouter-key-if-used>"
```

### Commands
```bash
npm install
npm test            # Runs all 39 tests
npx tsc --noEmit    # Verifies types compiles clean
npm run dev         # Launches local development server at http://localhost:3000
```


