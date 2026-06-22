# Beni's Weekly Planner — Design Spec

**Date:** 2026-06-21
**Owner:** john.sarreal@gmail.com (single user)
**Status:** Draft — pending user review (tweaks expected at the "Open Defaults" section)

## 1. Purpose

A hosted web app that connects to the user's Google Calendar and automatically blocks
time to accomplish recurring **habits** and deadline-driven **goals**. The scheduler is
hands-off (auto-schedule) and continuously re-plans as the calendar changes. A daily
Claude agent reviews progress, writes a summary, and reprioritizes/reschedules upcoming
days.

## 2. Confirmed Requirements

| Decision | Choice |
|---|---|
| Platform | Hosted web app |
| Users | Single user (just the owner) |
| Calendar read | Busy/free via incremental sync |
| Calendar write target | **Primary** calendar |
| Item types | Habits (recurring) + Goals (projects with deadline → sessions) |
| Scheduling mode | Auto-schedule (writes blocks directly) |
| Constraints | Sleep/wake blocks, awake/working hours, avoid existing events, per-item time-of-day prefs |
| Re-plan cadence | Continuous (watches calendar, re-plans on change) |
| Scheduling brain | **Approach A**: deterministic engine + Claude advisor |
| Daily review delivery | Email + in-app |
| Progress input | Inferred from calendar + user corrections |

## 3. Architecture

A **Next.js + TypeScript** app (Vercel-deployable):

- **UI** — weekly calendar view, habit/goal management, settings, daily-review screen.
- **API routes** — CRUD for habits/goals/settings; calendar sync; plan generation; progress updates.
- **Scheduling engine** — pure TypeScript module, no I/O, fully unit-testable.
- **Google Calendar client** — OAuth + incremental read + idempotent write/update/delete of planner blocks.
- **Daily agent** — an **LLM-agnostic agent runner** (see §7) for review, summary, and
  structured adjustments. Provider-pluggable: OpenRouter models, an "agy" runner, and a
  fake runner for tests.
- **Background jobs** — two cron jobs: frequent sync+replan tick; daily agent review.
- **Datastore** — Prisma ORM. **SQLite for local dev/test** (zero-setup), **Postgres
  (Neon / Vercel Postgres) for production**. List/JSON fields are stored as JSON-encoded
  `String` columns so the same schema runs on both engines.

## 4. Data Model

- **Settings** — time zone; awake hours and working hours **per day of week**; default
  sleep/wake times; OAuth tokens; `blackoutDays` (global do-not-schedule dates);
  agent review time; email address.
- **Habit** — name; duration; frequency (e.g. `3×/week` or `daily`); time-of-day
  preference (morning/afternoon/evening/any); priority; optional fixed days;
  `type` (`normal` | `sleep`). Sleep habits emit fixed sleep/wake blocks.
- **Goal** — name; total effort (hrs); deadline; `earliestStart` (default: now);
  session length min/max; time-of-day preference; priority; percent complete.
- **Block** — links to a habit or goal; start/end; status (`planned` | `done` |
  `partial` | `skipped`); Google event ID; `source` tag (so the app only ever touches
  its own blocks).
- **DailyReview** — date; generated summary; agent adjustments (structured); user feedback.

**Explicitly out of scope for v1 (YAGNI):** location, energy level, inter-goal
dependencies, multi-calendar support, recurring goals.

## 5. Scheduling Engine (core)

Pure function: `plan(items, constraints, existingEvents, window) → desiredBlocks[]`.

1. **Fixed blocks first:** sleep/wake blocks, then existing Google events become "busy".
2. **Free slots:** compute open intervals within awake/working hours across a rolling
   **14-day** planning window, excluding `blackoutDays`.
3. **Placement by priority**, honoring time-of-day prefs:
   - Goals: split remaining effort into sessions sized between min/max, scheduled
     working **backward from the deadline** with a safety margin, not before `earliestStart`.
   - Habits: distribute the weekly frequency evenly across eligible days/slots.
4. **No double-booking**; insert configurable buffers between blocks.
5. **Diff/reconcile:** compare desired blocks to existing planner blocks on the calendar;
   only create/move/delete what actually changed (prevents churn on every tick).

## 6. Calendar Sync & Continuous Re-planning

- OAuth once; store refresh token.
- **Incremental sync** using Google `syncToken`; a cron tick pulls changes. If real
  events changed within the window, re-plan and reconcile only affected planner blocks.
- Planner blocks tagged via extended properties; the app never modifies real events.
- `syncToken` invalidation → full resync fallback.

## 7. Daily Agent (LLM-agnostic)

- Cron fires at the configured review time. Agent input: today's planned blocks, inferred
  outcomes (past block still present ⇒ likely done; deleted/moved ⇒ flag), explicit user
  marks, and goal/habit progress.
- Agent output: natural-language **summary**, **progress assessment**, and structured
  **adjustments** (bump lagging goal priority, add/defer a session). Adjustments feed the
  engine's next replan.
- Delivery: **email** (via the owner's Gmail) + **in-app review screen** for confirm/correct,
  which updates progress and triggers a replan.

### 7.1 LLM-agnostic agent runner

Emulates the runner abstraction in
`/Users/johnsarreal/sarreal-personal/AI_Native_SDLC/feedback-app/app/agent/`
(`runner.py` Protocol + `api_runner.py` OpenAI-compatible HTTP runner +
`claude_runner.py` CLI runner + `FakeAgentRunner`). Ported to TypeScript:

- **`AgentRunner` interface** — single method, e.g.
  `runReview(input: ReviewInput): Promise<ReviewResult>`, where `ReviewResult` carries the
  summary text + structured adjustments (the planner's analogue of feedback-app's
  `AgentResult`).
- **`OpenRouterRunner`** — calls an **OpenAI-compatible** chat-completions endpoint
  (configurable `baseUrl`, `apiKey`, `model`); OpenRouter is the default base URL. Same
  request/response shape as feedback-app's `ApiAgentRunner` (`messages`, optional `tools`,
  `choices[0].message`).
- **`AgyRunner`** — wraps **Google's Antigravity CLI** (`agy`). CLI-based, mirroring
  feedback-app's `ClaudeCodeRunner`: run the CLI headlessly with the review prompt, have it
  write a structured result file (JSON `ReviewResult`), then read and parse it. Configurable
  binary path/args.
- **`FakeAgentRunner`** — returns a canned `ReviewResult` for deterministic tests.
- **Selection** — chosen at runtime from config/env (`AGENT_PROVIDER`, model id, key, base
  URL). The rest of the app depends only on the `AgentRunner` interface, never a concrete
  provider.

## 8. Error Handling

- Token refresh failure → "reconnect Google" state in UI.
- `syncToken` invalidation → full resync.
- LLM/agent failure → skip adjustments, still send a basic summary; never blocks scheduling.
- Calendar writes idempotent (keyed by block ID) so retries are safe.

## 9. Testing

- Engine: extensive **TDD** unit tests (fixtures → assert placement, no overlaps,
  deadline satisfaction, buffer/cap adherence).
- Calendar client & agent: integration tests with mocked Google/Claude APIs.

## 10. Build Phasing (one spec, sequenced)

1. Foundations: scaffold, data model, settings, Google OAuth.
2. Scheduling engine (TDD) + write blocks to calendar.
3. Habit/goal management UI + weekly view.
4. Continuous sync + reconcile.
5. Daily Claude agent + email + review screen.

## 11. Open Defaults — confirm or override at review

These were not separately specified; I chose reasonable defaults. Change any of them.

- **Buffer between blocks:** 15 min.
- **Max goal/focus hours scheduled per day:** 4 hrs (sleep and habits excluded from this cap).
- **Goal fill strategy:** schedule only enough to meet the deadline with a safety margin —
  do *not* greedily fill all free time; spread sessions evenly.
- **Habit spread:** evenly across the week; respect fixed days when set.
- **Weekend handling:** governed by per-day awake/working hours; by default goals are
  scheduled on weekends unless that day's working hours are empty.
- **Agent timing:** **evening** daily review only (default 6:00 PM local), to avoid
  over-emailing. Morning brief can be added later.
- **Agent autonomy:** may freely (re)schedule planner blocks in the next 7 days and apply
  priority/effort adjustments automatically; changes are reported in the summary for
  correction. It never touches real (non-planner) events.
- **Planning window:** rolling 14 days.
- **Sync tick frequency:** every 15 min.
- **Daily agent provider:** LLM-agnostic via the §7.1 runner abstraction. Two real
  adapters: **OpenRouter** (OpenAI-compatible HTTP) and **agy** (Google's Antigravity CLI),
  plus a fake for tests. Default provider configurable via env.
