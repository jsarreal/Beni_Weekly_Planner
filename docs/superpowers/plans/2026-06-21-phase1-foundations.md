# Beni's Weekly Planner — Phase 1: Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js + TypeScript app with a typed data model, a settings store, and working Google OAuth so the app can read/write the user's primary calendar.

**Architecture:** A Next.js (App Router) + TypeScript app deployable on Vercel. Postgres (Neon) via Prisma for persistence. Google OAuth 2.0 (offline access, refresh token stored) scoped to Calendar read/write. This phase delivers a runnable app where the single user connects Google and edits scheduling settings; later phases add the engine, UI, sync, and agent.

**Tech Stack:** Next.js 15 (App Router), TypeScript (strict), Prisma (**SQLite** for dev/test, Postgres for prod), `googleapis` (Google API client), Vitest (unit/integration tests), Zod (validation).

## Global Constraints

- Datastore: Prisma with **SQLite** for dev/test (`DATABASE_URL="file:./dev.db"`), Postgres for prod. Because SQLite has no scalar-list type, **all list and structured fields are stored as JSON-encoded `String` columns** (e.g. `dayWindows`, `blackoutDays`, `fixedDays`, `adjustments`); the service layer parses/serializes them. This is portable to Postgres unchanged.
- Single user only — no multi-tenant logic; one Settings row, one Google connection.
- Calendar **write target is the primary calendar**; planner-created events MUST be tagged via extended properties (`private.beniPlanner = "1"`) so the app only ever touches its own events.
- Language: TypeScript with `"strict": true`. All new code typed; no `any` without justification.
- Tests: Vitest. TDD — write the failing test first for every unit of logic.
- Secrets (OAuth client secret, tokens, DB URL) come from environment variables; never commit them. Provide `.env.example`.
- Time zone is user-configured in Settings; never assume server local time for scheduling math.
- Commit after each task with a conventional-commit message.

---

### Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`, `.gitignore`, `app/layout.tsx`, `app/page.tsx`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a runnable Next.js app and a working `npm test` command other tasks rely on.

- [ ] **Step 1: Initialize the app and dependencies**

```bash
cd "/Users/johnsarreal/Beni's Weekly Planner"
npx create-next-app@latest . --typescript --app --no-tailwind --eslint --src-dir=false --import-alias "@/*" --use-npm --yes
npm install prisma @prisma/client googleapis zod
npm install -D vitest @vitejs/plugin-react
```

- [ ] **Step 2: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
  },
});
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 3: Write a smoke test**

Create `tests/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs the test suite", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run the smoke test**

Run: `npm test`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Create `.env.example`**

```
DATABASE_URL="file:./dev.db"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"
APP_BASE_URL="http://localhost:3000"
```

Ensure `.gitignore` includes `.env` and `.env*.local`.

- [ ] **Step 6: Commit** (the repo and `phase1-foundations` branch already exist)

```bash
git add -A
git commit -m "chore: scaffold Next.js + TypeScript app with Vitest"
```

---

### Task 2: Prisma schema + data model

**Files:**
- Create: `prisma/schema.prisma`, `lib/db.ts`
- Test: `tests/db/schema.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` env from Task 1.
- Produces:
  - `prisma` client singleton exported from `lib/db.ts` as `export const prisma: PrismaClient`.
  - Models later tasks rely on: `Settings`, `Habit`, `Goal`, `Block`, `DailyReview` with the fields below.

- [ ] **Step 1: Define the Prisma schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  // Dev/test uses SQLite; switch provider to "postgresql" for production.
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Settings {
  id              Int      @id @default(1)
  timeZone        String   @default("America/Los_Angeles")
  // JSON string: { "mon": {"wakeMin":420,"sleepMin":1380,"workStartMin":540,"workEndMin":1020}, ... }
  dayWindows      String
  blackoutDays    String   @default("[]") // JSON string array of ISO dates "2026-06-25"
  agentReviewMin  Int      @default(1080) // minutes after midnight, default 18:00
  agentProvider   String   @default("openrouter")
  email           String?
  googleRefresh   String?  // encrypted refresh token; null until connected
  googleAccessTok String?
  googleTokenExp  DateTime?
  updatedAt       DateTime @updatedAt
}

model Habit {
  id           String   @id @default(cuid())
  name         String
  durationMin  Int
  perWeek      Int      // frequency: times per week (daily = 7)
  timeOfDay    String   @default("any") // morning|afternoon|evening|any
  priority     Int      @default(3)     // 1 (highest) .. 5
  fixedDays    String   @default("[]")  // JSON string array e.g. ["mon","wed","fri"]; "[]" = flexible
  type         String   @default("normal") // normal|sleep
  createdAt    DateTime @default(now())
  blocks       Block[]
}

model Goal {
  id             String   @id @default(cuid())
  name           String
  totalEffortMin Int
  completedMin   Int      @default(0)
  deadline       DateTime
  earliestStart  DateTime @default(now())
  sessionMinMin  Int      @default(30)
  sessionMaxMin  Int      @default(120)
  timeOfDay      String   @default("any")
  priority       Int      @default(3)
  createdAt      DateTime @default(now())
  blocks         Block[]
}

model Block {
  id            String   @id @default(cuid())
  start         DateTime
  end           DateTime
  status        String   @default("planned") // planned|done|partial|skipped
  googleEventId String?
  source        String   @default("planner") // always "planner" for app blocks
  habitId       String?
  habit         Habit?   @relation(fields: [habitId], references: [id], onDelete: Cascade)
  goalId        String?
  goal          Goal?    @relation(fields: [goalId], references: [id], onDelete: Cascade)
  createdAt     DateTime @default(now())
}

model DailyReview {
  id          String   @id @default(cuid())
  date        DateTime
  summary     String
  adjustments String   @default("{}") // JSON string of structured adjustments
  feedback    String?
  createdAt   DateTime @default(now())
}
```

- [ ] **Step 2: Create the Prisma client singleton**

Create `lib/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 3: Generate client and run the migration**

```bash
npx prisma generate
npx prisma migrate dev --name init
```

Expected: migration created under `prisma/migrations/`, client generated.

- [ ] **Step 4: Write a schema/CRUD test**

Create `tests/db/schema.test.ts` (requires a reachable test DB via `DATABASE_URL`):

```ts
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";

describe("data model", () => {
  it("creates a habit and reads it back", async () => {
    const h = await prisma.habit.create({
      data: { name: "Exercise", durationMin: 45, perWeek: 3, timeOfDay: "morning" },
    });
    const found = await prisma.habit.findUnique({ where: { id: h.id } });
    expect(found?.name).toBe("Exercise");
    expect(found?.perWeek).toBe(3);
    await prisma.habit.delete({ where: { id: h.id } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npm test -- tests/db/schema.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Prisma data model (Settings, Habit, Goal, Block, DailyReview)"
```

---

### Task 3: Settings service + Zod validation

**Files:**
- Create: `lib/settings.ts`, `lib/validation.ts`
- Test: `tests/settings.test.ts`

**Interfaces:**
- Consumes: `prisma` from `lib/db.ts`.
- Produces:
  - `export type DayWindow = { wakeMin: number; sleepMin: number; workStartMin: number; workEndMin: number }`
  - `export const settingsSchema: ZodSchema` (validates the editable settings payload)
  - `export async function getSettings(): Promise<Settings>` — returns the single row, creating defaults if absent.
  - `export async function updateSettings(input: unknown): Promise<Settings>` — validates with `settingsSchema`, persists, returns updated row.

- [ ] **Step 1: Write the failing test**

Create `tests/settings.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { getSettings, updateSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";

describe("settings service", () => {
  it("returns defaults when none exist", async () => {
    const s = await getSettings();
    expect(s.id).toBe(1);
    expect(s.agentProvider).toBe("openrouter");
  });

  it("rejects an invalid day window (wake after sleep)", async () => {
    await expect(
      updateSettings({ dayWindows: { mon: { wakeMin: 1400, sleepMin: 100, workStartMin: 540, workEndMin: 1020 } } })
    ).rejects.toThrow();
  });

  it("persists a valid timezone update", async () => {
    const s = await updateSettings({ timeZone: "America/New_York" });
    expect(s.timeZone).toBe("America/New_York");
  });

  afterAll(async () => { await prisma.$disconnect(); });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- tests/settings.test.ts`
Expected: FAIL — module `@/lib/settings` not found.

- [ ] **Step 3: Implement validation**

Create `lib/validation.ts`:

```ts
import { z } from "zod";

export const dayWindowSchema = z
  .object({
    wakeMin: z.number().int().min(0).max(1440),
    sleepMin: z.number().int().min(0).max(1440),
    workStartMin: z.number().int().min(0).max(1440),
    workEndMin: z.number().int().min(0).max(1440),
  })
  .refine((w) => w.wakeMin < w.sleepMin, "wake must be before sleep")
  .refine((w) => w.workStartMin <= w.workEndMin, "work start must be <= work end");

export const settingsSchema = z.object({
  timeZone: z.string().min(1).optional(),
  dayWindows: z.record(z.string(), dayWindowSchema).optional(),
  blackoutDays: z.array(z.string()).optional(),
  agentReviewMin: z.number().int().min(0).max(1440).optional(),
  agentProvider: z.enum(["openrouter", "agy", "fake"]).optional(),
  email: z.string().email().nullish(),
});
```

- [ ] **Step 4: Implement the settings service**

Create `lib/settings.ts`:

```ts
import { prisma } from "@/lib/db";
import { settingsSchema } from "@/lib/validation";

export type DayWindow = {
  wakeMin: number;
  sleepMin: number;
  workStartMin: number;
  workEndMin: number;
};

const DEFAULT_DAY: DayWindow = { wakeMin: 420, sleepMin: 1380, workStartMin: 540, workEndMin: 1020 };
const DEFAULT_WINDOWS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].reduce(
  (acc, d) => ({ ...acc, [d]: DEFAULT_DAY }),
  {} as Record<string, DayWindow>
);

export async function getSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  // dayWindows/blackoutDays are JSON-encoded String columns (SQLite-compatible).
  return prisma.settings.create({
    data: { id: 1, dayWindows: JSON.stringify(DEFAULT_WINDOWS), blackoutDays: "[]" },
  });
}

export async function updateSettings(input: unknown) {
  const parsed = settingsSchema.parse(input);
  await getSettings(); // ensure row exists
  // Serialize structured fields to JSON strings for storage.
  const { dayWindows, blackoutDays, ...rest } = parsed;
  return prisma.settings.update({
    where: { id: 1 },
    data: {
      ...rest,
      ...(dayWindows !== undefined ? { dayWindows: JSON.stringify(dayWindows) } : {}),
      ...(blackoutDays !== undefined ? { blackoutDays: JSON.stringify(blackoutDays) } : {}),
    },
  });
}
```

- [ ] **Step 5: Run the test**

Run: `npm test -- tests/settings.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: settings service with Zod validation"
```

---

### Task 4: Token encryption helper

**Files:**
- Create: `lib/crypto.ts`
- Test: `tests/crypto.test.ts`

**Interfaces:**
- Consumes: `APP_ENCRYPTION_KEY` env (32-byte base64). Add it to `.env.example`.
- Produces:
  - `export function encrypt(plain: string): string` — returns `iv:tag:ciphertext` base64 string.
  - `export function decrypt(blob: string): string` — inverse of `encrypt`.

- [ ] **Step 1: Write the failing test**

Create `tests/crypto.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "@/lib/crypto";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("crypto", () => {
  it("round-trips a secret", () => {
    const secret = "refresh-token-123";
    const blob = encrypt(secret);
    expect(blob).not.toContain(secret);
    expect(decrypt(blob)).toBe(secret);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- tests/crypto.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement AES-256-GCM helper**

Create `lib/crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const b64 = process.env.APP_ENCRYPTION_KEY;
  if (!b64) throw new Error("APP_ENCRYPTION_KEY is not set");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes (base64)");
  return k;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decrypt(blob: string): string {
  const [ivB64, tagB64, ctB64] = blob.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- tests/crypto.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the env var and commit**

Add to `.env.example`: `APP_ENCRYPTION_KEY=""  # 32 bytes, base64 (openssl rand -base64 32)`

```bash
git add -A
git commit -m "feat: AES-256-GCM helper for encrypting stored tokens"
```

---

### Task 5: Google OAuth client + token storage

**Files:**
- Create: `lib/google/oauth.ts`
- Test: `tests/google/oauth.test.ts`

**Interfaces:**
- Consumes: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` env; `encrypt`/`decrypt` from `lib/crypto.ts`; `prisma`.
- Produces:
  - `export function getAuthUrl(): string` — consent URL with offline access + calendar scope.
  - `export async function exchangeCode(code: string): Promise<void>` — exchanges code, stores encrypted refresh token + access token + expiry in Settings.
  - `export async function getAuthedClient(): Promise<OAuth2Client>` — returns a `google.auth.OAuth2` with valid credentials, refreshing if expired and persisting the new access token.

- [ ] **Step 1: Write the failing test (token persistence via a mocked client)**

Create `tests/google/oauth.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("googleapis", () => {
  class FakeOAuth2 {
    credentials: Record<string, unknown> = {};
    generateAuthUrl() { return "https://accounts.google.com/o/oauth2/auth?fake=1"; }
    async getToken(code: string) {
      return { tokens: { refresh_token: "r-" + code, access_token: "a-" + code, expiry_date: Date.now() + 3600_000 } };
    }
    setCredentials(c: Record<string, unknown>) { this.credentials = c; }
  }
  return { google: { auth: { OAuth2: FakeOAuth2 } } };
});

import { getAuthUrl, exchangeCode, getAuthedClient } from "@/lib/google/oauth";
import { prisma } from "@/lib/db";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  process.env.GOOGLE_CLIENT_ID = "cid";
  process.env.GOOGLE_CLIENT_SECRET = "csec";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/cb";
});

describe("google oauth", () => {
  it("builds a consent URL", () => {
    expect(getAuthUrl()).toContain("https://accounts.google.com");
  });

  it("exchanges a code and stores an encrypted refresh token", async () => {
    await exchangeCode("xyz");
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(s?.googleRefresh).toBeTruthy();
    expect(s?.googleRefresh).not.toContain("r-xyz"); // stored encrypted
    const client = await getAuthedClient();
    expect(client).toBeTruthy();
  });

  afterAll(async () => { await prisma.$disconnect(); });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- tests/google/oauth.test.ts`
Expected: FAIL — module `@/lib/google/oauth` not found.

- [ ] **Step 3: Implement the OAuth helper**

Create `lib/google/oauth.ts`:

```ts
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { getSettings } from "@/lib/settings";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

function client(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  ) as unknown as OAuth2Client;
}

export function getAuthUrl(): string {
  return client().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function exchangeCode(code: string): Promise<void> {
  const c = client();
  const { tokens } = await c.getToken(code);
  await getSettings();
  await prisma.settings.update({
    where: { id: 1 },
    data: {
      googleRefresh: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      googleAccessTok: tokens.access_token ? encrypt(tokens.access_token) : undefined,
      googleTokenExp: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    },
  });
}

export async function getAuthedClient(): Promise<OAuth2Client> {
  const s = await getSettings();
  if (!s.googleRefresh) throw new Error("Google not connected");
  const c = client();
  c.setCredentials({
    refresh_token: decrypt(s.googleRefresh),
    access_token: s.googleAccessTok ? decrypt(s.googleAccessTok) : undefined,
    expiry_date: s.googleTokenExp ? s.googleTokenExp.getTime() : undefined,
  });
  // Persist refreshed access tokens transparently.
  c.on("tokens", async (t) => {
    await prisma.settings.update({
      where: { id: 1 },
      data: {
        googleAccessTok: t.access_token ? encrypt(t.access_token) : undefined,
        googleTokenExp: t.expiry_date ? new Date(t.expiry_date) : undefined,
      },
    });
  });
  return c;
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- tests/google/oauth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Google OAuth client with encrypted token storage and refresh"
```

---

### Task 6: OAuth API routes (connect + callback)

**Files:**
- Create: `app/api/auth/google/route.ts`, `app/api/auth/google/callback/route.ts`
- Test: `tests/google/routes.test.ts`

**Interfaces:**
- Consumes: `getAuthUrl`, `exchangeCode` from `lib/google/oauth.ts`; `APP_BASE_URL` env.
- Produces:
  - `GET /api/auth/google` → 302 redirect to Google consent.
  - `GET /api/auth/google/callback?code=...` → exchanges code, 302 redirect to `/?connected=1`.

- [ ] **Step 1: Write the failing test**

Create `tests/google/routes.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("@/lib/google/oauth", () => ({
  getAuthUrl: () => "https://accounts.google.com/o/oauth2/auth?fake=1",
  exchangeCode: vi.fn(async () => {}),
}));

import { GET as connect } from "@/app/api/auth/google/route";
import { GET as callback } from "@/app/api/auth/google/callback/route";
import { exchangeCode } from "@/lib/google/oauth";

beforeAll(() => { process.env.APP_BASE_URL = "http://localhost:3000"; });

describe("oauth routes", () => {
  it("redirects to consent", async () => {
    const res = await connect();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("accounts.google.com");
  });

  it("handles the callback and redirects home", async () => {
    const req = new Request("http://localhost:3000/api/auth/google/callback?code=abc");
    const res = await callback(req);
    expect(exchangeCode).toHaveBeenCalledWith("abc");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("connected=1");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- tests/google/routes.test.ts`
Expected: FAIL — route modules not found.

- [ ] **Step 3: Implement the connect route**

Create `app/api/auth/google/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google/oauth";

export async function GET() {
  return NextResponse.redirect(getAuthUrl(), 302);
}
```

- [ ] **Step 4: Implement the callback route**

Create `app/api/auth/google/callback/route.ts`:

```ts
import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google/oauth";

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  if (!code) return NextResponse.redirect(`${base}/?error=missing_code`, 302);
  await exchangeCode(code);
  return NextResponse.redirect(`${base}/?connected=1`, 302);
}
```

- [ ] **Step 5: Run the test**

Run: `npm test -- tests/google/routes.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Google OAuth connect + callback API routes"
```

---

### Task 7: Settings API route + minimal connect UI

**Files:**
- Create: `app/api/settings/route.ts`
- Modify: `app/page.tsx`
- Test: `tests/settings-route.test.ts`

**Interfaces:**
- Consumes: `getSettings`, `updateSettings` from `lib/settings.ts`.
- Produces:
  - `GET /api/settings` → JSON of current settings (token fields omitted).
  - `PUT /api/settings` → validates + persists, returns updated settings (token fields omitted).
  - Home page shows connection status and a "Connect Google Calendar" link to `/api/auth/google`.

- [ ] **Step 1: Write the failing test**

Create `tests/settings-route.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { GET, PUT } from "@/app/api/settings/route";
import { prisma } from "@/lib/db";

describe("settings route", () => {
  it("GET returns settings without token fields", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("timeZone");
    expect(body).not.toHaveProperty("googleRefresh");
  });

  it("PUT updates the timezone", async () => {
    const req = new Request("http://localhost:3000/api/settings", {
      method: "PUT",
      body: JSON.stringify({ timeZone: "Europe/London" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req);
    const body = await res.json();
    expect(body.timeZone).toBe("Europe/London");
  });

  afterAll(async () => { await prisma.$disconnect(); });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- tests/settings-route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement the settings route**

Create `app/api/settings/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/settings";

function sanitize(s: Awaited<ReturnType<typeof getSettings>>) {
  const { googleRefresh, googleAccessTok, ...safe } = s;
  return { ...safe, connected: Boolean(googleRefresh) };
}

export async function GET() {
  return NextResponse.json(sanitize(await getSettings()));
}

export async function PUT(req: Request) {
  try {
    const updated = await updateSettings(await req.json());
    return NextResponse.json(sanitize(updated));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 4: Implement the minimal home UI**

Replace `app/page.tsx`:

```tsx
import { getSettings } from "@/lib/settings";

export default async function Home() {
  const s = await getSettings();
  const connected = Boolean(s.googleRefresh);
  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>Beni&apos;s Weekly Planner</h1>
      <p>Google Calendar: {connected ? "✅ Connected" : "❌ Not connected"}</p>
      {!connected && <a href="/api/auth/google">Connect Google Calendar</a>}
    </main>
  );
}
```

- [ ] **Step 5: Run the test**

Run: `npm test -- tests/settings-route.test.ts`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, open `http://localhost:3000`. Expected: page renders connection status; clicking "Connect Google Calendar" begins the OAuth flow (requires real Google credentials in `.env`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: settings API route + minimal connect UI"
```

---

## Self-Review (against the spec)

- **§2 Confirmed requirements** — single-user (one Settings row), primary-calendar write + planner tagging constant (Task 2/Global Constraints), incremental-sync foundations deferred to Phase 4 (noted in roadmap). ✓
- **§4 Data model** — Settings, Habit, Goal, Block, DailyReview all created in Task 2 with the spec's fields incl. `blackoutDays`, `earliestStart`, sleep habit `type`, block `source`/`googleEventId`/`status`. ✓
- **§6 Calendar sync** — OAuth + token refresh + encrypted storage delivered (Tasks 4–6); actual sync/reconcile is Phase 4. ✓ (scoped out, intentionally)
- **§7.1 agent runner** — not in Phase 1; built in Phase 5. ✓ (scoped out)
- **Placeholder scan** — no TBD/TODO; every code step shows full code. ✓
- **Type consistency** — `getSettings`/`updateSettings`/`getAuthedClient`/`exchangeCode`/`getAuthUrl` names consistent across tasks; `DayWindow` shape matches `dayWindowSchema`. ✓

---

## Roadmap — subsequent phase plans (each its own document)

- **Phase 2 — Scheduling engine + calendar write:** pure `plan()` function (TDD), free-slot computation, priority placement, deadline backsolving, diff/reconcile, `lib/google/calendar.ts` create/update/delete with planner tagging. → produces blocks written to the primary calendar.
- **Phase 3 — Habit/Goal management UI + weekly view:** CRUD screens and a weekly calendar rendering of blocks.
- **Phase 4 — Continuous sync + reconcile:** Google `syncToken` incremental sync, cron tick (every 15 min), re-plan trigger, full-resync fallback.
- **Phase 5 — Daily agent:** `AgentRunner` interface + `OpenRouterRunner` (OpenAI-compatible HTTP) + `AgyRunner` (Antigravity CLI) + `FakeAgentRunner`; daily cron review; email (Gmail) + in-app review screen; adjustments feed the engine.
