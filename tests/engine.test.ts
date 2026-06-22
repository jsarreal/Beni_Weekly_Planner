import { describe, it, expect } from "vitest";
import { plan, PlanItem, PlanConstraints, CalendarEvent } from "../lib/engine";

describe("Scheduling Engine", () => {
  const defaultDayWindow = {
    wakeTime: "07:00",
    sleepTime: "22:00",
    workStartTime: "09:00",
    workEndTime: "17:00",
  };

  const constraints: PlanConstraints = {
    timeZone: "America/Los_Angeles",
    dayWindows: {
      mon: defaultDayWindow,
      tue: defaultDayWindow,
      wed: defaultDayWindow,
      thu: defaultDayWindow,
      fri: defaultDayWindow,
      sat: { ...defaultDayWindow, workStartTime: "00:00", workEndTime: "00:00" }, // no work on weekends
      sun: { ...defaultDayWindow, workStartTime: "00:00", workEndTime: "00:00" },
    },
    blackoutDays: [],
    bufferMin: 15,
    maxGoalHoursPerDay: 4,
  };

  const startOfWeek = new Date("2026-06-22T00:00:00Z"); // Monday
  const endOfWeek = new Date("2026-06-29T00:00:00Z");   // Next Monday
  const planningWindow = { start: startOfWeek, end: endOfWeek };

  it("schedules sleep/wake blocks correctly based on constraints", () => {
    const items: PlanItem[] = [
      {
        id: "sleep-habit",
        name: "Sleep",
        type: "sleep",
        priority: 1,
        durationMin: 540, // 9 hours
      },
    ];

    const blocks = plan(items, constraints, [], planningWindow);
    // Should have sleep blocks for each night/day in the window
    const sleepBlocks = blocks.filter(b => b.name === "Sleep");
    expect(sleepBlocks.length).toBeGreaterThanOrEqual(7);

    // Verify first sleep block (Sunday night local time: June 21 22:00 PDT -> June 22 05:00 UTC)
    const firstSleep = sleepBlocks[0];
    expect(firstSleep.start.toISOString()).toContain("2026-06-22T05:00:00");
    expect(firstSleep.end.toISOString()).toContain("2026-06-22T14:00:00");

    // Verify Monday night sleep block (Monday night local time: June 22 22:00 PDT -> June 23 05:00 UTC)
    const mondaySleep = sleepBlocks[1];
    expect(mondaySleep.start.toISOString()).toContain("2026-06-23T05:00:00");
    expect(mondaySleep.end.toISOString()).toContain("2026-06-23T14:00:00");
  });

  it("respects existing calendar events and avoids double-booking", () => {
    const existingEvents: CalendarEvent[] = [
      {
        id: "event-1",
        start: new Date("2026-06-22T09:00:00Z"),
        end: new Date("2026-06-22T10:00:00Z"),
      },
    ];

    const items: PlanItem[] = [
      {
        id: "habit-1",
        name: "Read",
        type: "habit",
        priority: 2,
        durationMin: 60,
        perWeek: 1,
        timeOfDay: "morning",
      },
    ];

    const blocks = plan(items, constraints, existingEvents, planningWindow);
    const readBlocks = blocks.filter(b => b.name === "Read");
    expect(readBlocks.length).toBe(1);

    // Read block must not overlap with the 9:00 - 10:00 existing event
    const start = readBlocks[0].start;
    const end = readBlocks[0].end;

    // It should satisfy the 15-minute buffer requirement
    const overlap = start < existingEvents[0].end && end > existingEvents[0].start;
    expect(overlap).toBe(false);
  });

  it("schedules goal sessions backward from deadline", () => {
    const items: PlanItem[] = [
      {
        id: "goal-1",
        name: "Project Presentation",
        type: "goal",
        priority: 1,
        durationMin: 120, // 2 hours
        totalEffortMin: 120,
        completedMin: 0,
        deadline: new Date("2026-06-26T17:00:00Z"), // Friday 5pm
        earliestStart: new Date("2026-06-22T00:00:00Z"),
        sessionMinMin: 60,
        sessionMaxMin: 120,
      },
    ];

    const blocks = plan(items, constraints, [], planningWindow);
    const goalBlocks = blocks.filter(b => b.name === "Project Presentation");
    expect(goalBlocks.length).toBeGreaterThan(0);

    // Goal blocks should be before the deadline
    for (const block of goalBlocks) {
      expect(block.end.getTime()).toBeLessThanOrEqual(items[0].deadline!.getTime());
    }
  });

  it("enforces maximum goal hours per day", () => {
    const items: PlanItem[] = [
      {
        id: "goal-heavy",
        name: "Massive Task",
        type: "goal",
        priority: 1,
        durationMin: 600, // 10 hours
        totalEffortMin: 600,
        completedMin: 0,
        deadline: new Date("2026-06-25T17:00:00Z"),
        earliestStart: new Date("2026-06-22T00:00:00Z"),
        sessionMinMin: 60,
        sessionMaxMin: 120,
      },
    ];

    const blocks = plan(items, constraints, [], planningWindow);
    const goalBlocks = blocks.filter(b => b.name === "Massive Task");

    // Group by day and verify no day has > 4 hours of goal blocks
    const dailyHours: Record<string, number> = {};
    for (const b of goalBlocks) {
      const dateStr = b.start.toISOString().split("T")[0];
      const durationHours = (b.end.getTime() - b.start.getTime()) / 1000 / 60 / 60;
      dailyHours[dateStr] = (dailyHours[dateStr] || 0) + durationHours;
    }

    for (const day in dailyHours) {
      expect(dailyHours[day]).toBeLessThanOrEqual(constraints.maxGoalHoursPerDay);
    }
  });

  it("enforces block durations corresponding to the attributes of habits and goals", () => {
    const items: PlanItem[] = [
      {
        id: "habit-short",
        name: "Prayer",
        type: "habit",
        priority: 1,
        durationMin: 5,
        perWeek: 1,
        timeOfDay: "evening",
      },
      {
        id: "goal-fixed",
        name: "Learn TypeScript",
        type: "goal",
        priority: 2,
        durationMin: 60,
        totalEffortMin: 120,
        completedMin: 0,
        deadline: new Date("2026-06-26T17:00:00Z"),
        earliestStart: new Date("2026-06-22T00:00:00Z"),
        sessionMinMin: 60,
        sessionMaxMin: 60,
      }
    ];

    const blocks = plan(items, constraints, [], planningWindow);
    
    // Check Prayer habit blocks
    const prayerBlocks = blocks.filter(b => b.name === "Prayer");
    expect(prayerBlocks.length).toBe(1);
    const prayerDuration = (prayerBlocks[0].end.getTime() - prayerBlocks[0].start.getTime()) / 60000;
    expect(prayerDuration).toBe(5); // must be exactly 5 minutes!

    // Check Goal blocks
    const goalBlocks = blocks.filter(b => b.name === "Learn TypeScript");
    expect(goalBlocks.length).toBe(2); // 120 total / 60 per session = 2 sessions
    for (const block of goalBlocks) {
      const duration = (block.end.getTime() - block.start.getTime()) / 60000;
      expect(duration).toBe(60); // session length must be exactly 60 minutes!
    }
  });
});
