import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { runScheduling } from "../lib/scheduler";
import { prisma } from "../lib/db";

// Mock OAuth
vi.mock("../lib/google/oauth", () => ({
  getAuthedClient: vi.fn().mockResolvedValue({}),
}));

let mockPlannerEvents: any[] = [];

// Mock Google Calendar API functions
vi.mock("../lib/google/calendar", () => {
  return {
    listAllEvents: vi.fn().mockImplementation(async () => [
      {
        id: "existing-google-1",
        summary: "Meeting",
        start: { dateTime: "2026-06-22T14:00:00Z" },
        end: { dateTime: "2026-06-22T15:00:00Z" },
      },
      ...mockPlannerEvents.map(e => ({
        id: e.id,
        summary: e.name,
        start: { dateTime: e.start.toISOString() },
        end: { dateTime: e.end.toISOString() },
        extendedProperties: { private: { beniPlanner: "1", habitId: e.habitId, goalId: e.goalId } }
      }))
    ]),
    listPlannerEvents: vi.fn().mockImplementation(async () => mockPlannerEvents),
    createPlannerEvent: vi.fn().mockImplementation(async (auth, block) => {
      const newEvent = {
        id: "new-google-event-id",
        name: block.name,
        start: block.start,
        end: block.end,
        habitId: block.habitId,
        goalId: block.goalId,
      };
      mockPlannerEvents.push(newEvent);
      return newEvent;
    }),
    updatePlannerEvent: vi.fn().mockImplementation(async (auth, id, block) => {
      const idx = mockPlannerEvents.findIndex(e => e.id === id);
      if (idx !== -1) {
        mockPlannerEvents[idx] = { ...mockPlannerEvents[idx], start: block.start, end: block.end, name: block.name };
      }
      return { id };
    }),
    deletePlannerEvent: vi.fn().mockImplementation(async (auth, id) => {
      mockPlannerEvents = mockPlannerEvents.filter(e => e.id !== id);
    }),
  };
});

import { createPlannerEvent } from "../lib/google/calendar";


describe("Scheduler Sync Integration", () => {
  beforeAll(async () => {
    // Setup Settings with connected google account
    await prisma.settings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        googleRefresh: "some-encrypted-token",
        dayWindows: JSON.stringify({
          mon: { wakeTime: "06:00", sleepTime: "22:00", workStartTime: "08:00", workEndTime: "17:00" },
          tue: { wakeTime: "06:00", sleepTime: "22:00", workStartTime: "08:00", workEndTime: "17:00" },
          wed: { wakeTime: "06:00", sleepTime: "22:00", workStartTime: "08:00", workEndTime: "17:00" },
          thu: { wakeTime: "06:00", sleepTime: "22:00", workStartTime: "08:00", workEndTime: "17:00" },
          fri: { wakeTime: "06:00", sleepTime: "22:00", workStartTime: "08:00", workEndTime: "17:00" },
          sat: { wakeTime: "06:00", sleepTime: "22:00", workStartTime: "08:00", workEndTime: "17:00" },
          sun: { wakeTime: "06:00", sleepTime: "22:00", workStartTime: "08:00", workEndTime: "17:00" },
        }),
        blackoutDays: "[]",
      },
      update: {
        googleRefresh: "some-encrypted-token",
      },
    });
  });

  afterAll(async () => {
    await prisma.habit.deleteMany({});
    await prisma.goal.deleteMany({});
    await prisma.block.deleteMany({});
    await prisma.$disconnect();
  });

  it("schedules a habit, writing to google calendar and local database", async () => {
    // Create a Habit
    const habit = await prisma.habit.create({
      data: {
        name: "Exercise Test",
        durationMin: 30,
        perWeek: 1,
        fixedDays: JSON.stringify(["mon"]),
        timeOfDay: "morning",
      },
    });

    // Run scheduler
    await runScheduling();

    // Verify it created a planner event
    expect(createPlannerEvent).toHaveBeenCalled();

    // Verify local block exists
    const blocks = await prisma.block.findMany({
      where: { habitId: habit.id },
    });
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].googleEventId).toBe("new-google-event-id");
  });
});
