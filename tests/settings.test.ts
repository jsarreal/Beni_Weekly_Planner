import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getSettings, updateSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";

describe("settings service", () => {
  beforeAll(async () => {
    await prisma.settings.deleteMany({});
  });

  it("returns defaults when none exist", async () => {
    const s = await getSettings();
    expect(s.id).toBe(1);
    expect(s.agentProvider).toBe("openrouter");
  });

  it("rejects an invalid day window (wake after sleep)", async () => {
    await expect(
      updateSettings({ dayWindows: { mon: { wakeTime: "22:00", sleepTime: "06:00", workStartTime: "08:00", workEndTime: "17:00" } } })
    ).rejects.toThrow();
  });

  it("persists a valid timezone update", async () => {
    const s = await updateSettings({ timeZone: "America/New_York" });
    expect(s.timeZone).toBe("America/New_York");
  });

  afterAll(async () => { await prisma.$disconnect(); });
});
