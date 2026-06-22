import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { syncCalendar } from "../lib/sync";
import { prisma } from "../lib/db";

vi.mock("../lib/google/oauth", () => ({
  getAuthedClient: vi.fn().mockResolvedValue({}),
}));

vi.mock("../lib/scheduler", () => ({
  runScheduling: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/google/calendar", () => ({
  getInitialSyncToken: vi.fn().mockResolvedValue("token-abc"),
  listIncrementalEvents: vi.fn(),
}));

import { getInitialSyncToken, listIncrementalEvents } from "../lib/google/calendar";
import { runScheduling } from "../lib/scheduler";

describe("Calendar Incremental Sync Service", () => {
  beforeAll(async () => {
    await prisma.settings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        googleRefresh: "refresh-tok",
        dayWindows: "{}",
        blackoutDays: "[]",
      },
      update: {
        googleRefresh: "refresh-tok",
        googleSyncToken: null,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("performs full sync initially when googleSyncToken is missing", async () => {
    // Make sure db token is null
    await prisma.settings.update({ where: { id: 1 }, data: { googleSyncToken: null } });

    const result = await syncCalendar();
    expect(result.synced).toBe(true);
    expect(result.replanned).toBe(true);
    expect(getInitialSyncToken).toHaveBeenCalled();
    expect(runScheduling).toHaveBeenCalled();

    // Verify token was saved
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(s?.googleSyncToken).toBe("token-abc");
  });

  it("handles incremental sync when syncToken is present and no events changed in window", async () => {
    vi.mocked(listIncrementalEvents).mockResolvedValueOnce({
      items: [
        {
          id: "some-event-outside-window",
          summary: "Outside Meeting",
          start: { dateTime: "2026-12-25T10:00:00Z" },
          end: { dateTime: "2026-12-25T11:00:00Z" },
        },
      ],
      nextSyncToken: "token-def",
    });

    vi.mocked(runScheduling).mockClear();

    const result = await syncCalendar();
    expect(result.synced).toBe(true);
    expect(result.replanned).toBe(false); // since event is outside the 14-day window
    expect(runScheduling).not.toHaveBeenCalled();

    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(s?.googleSyncToken).toBe("token-def");
  });

  it("triggers rescheduling if events are in planning window", async () => {
    const startOfToday = new Date();
    startOfToday.setUTCHours(10, 0, 0, 0);

    vi.mocked(listIncrementalEvents).mockResolvedValueOnce({
      items: [
        {
          id: "event-inside-window",
          summary: "Important Meeting",
          start: { dateTime: startOfToday.toISOString() },
          end: { dateTime: new Date(startOfToday.getTime() + 3600_000).toISOString() },
        },
      ],
      nextSyncToken: "token-ghi",
    });

    vi.mocked(runScheduling).mockClear();

    const result = await syncCalendar();
    expect(result.synced).toBe(true);
    expect(result.replanned).toBe(true);
    expect(runScheduling).toHaveBeenCalled();
  });

  it("performs full sync fallback on 410 error", async () => {
    const error410 = new Error("Sync token is invalid") as any;
    error410.code = 410;
    vi.mocked(listIncrementalEvents).mockRejectedValueOnce(error410);
    vi.mocked(getInitialSyncToken).mockResolvedValueOnce("token-new");

    vi.mocked(runScheduling).mockClear();

    const result = await syncCalendar();
    expect(result.synced).toBe(true);
    expect(result.replanned).toBe(true);
    expect(getInitialSyncToken).toHaveBeenCalled();
    expect(runScheduling).toHaveBeenCalled();

    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(s?.googleSyncToken).toBe("token-new");
  });
});
