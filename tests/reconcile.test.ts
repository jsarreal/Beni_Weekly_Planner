import { describe, it, expect } from "vitest";
import { reconcile, ReconcileResult } from "../lib/reconcile";
import { PlannedBlock } from "../lib/engine";

interface CalendarEventExtended {
  id: string;
  name: string;
  start: Date;
  end: Date;
  habitId?: string;
  goalId?: string;
}

describe("Reconciliation Diff", () => {
  it("determines creates when there are no existing events", () => {
    const desired: PlannedBlock[] = [
      {
        name: "Exercise",
        start: new Date("2026-06-22T08:00:00Z"),
        end: new Date("2026-06-22T09:00:00Z"),
        status: "planned",
        source: "planner",
        habitId: "habit-1",
      },
    ];

    const result = reconcile(desired, []);
    expect(result.create.length).toBe(1);
    expect(result.update.length).toBe(0);
    expect(result.delete.length).toBe(0);
    expect(result.create[0].name).toBe("Exercise");
  });

  it("determines deletes when existing events are no longer needed", () => {
    const existing: CalendarEventExtended[] = [
      {
        id: "g-1",
        name: "Exercise",
        start: new Date("2026-06-22T08:00:00Z"),
        end: new Date("2026-06-22T09:00:00Z"),
        habitId: "habit-1",
      },
    ];

    const result = reconcile([], existing);
    expect(result.create.length).toBe(0);
    expect(result.update.length).toBe(0);
    expect(result.delete.length).toBe(1);
    expect(result.delete[0]).toBe("g-1");
  });

  it("determines updates when times change", () => {
    const desired: PlannedBlock[] = [
      {
        name: "Exercise",
        start: new Date("2026-06-22T10:00:00Z"), // Moved from 8am to 10am
        end: new Date("2026-06-22T11:00:00Z"),
        status: "planned",
        source: "planner",
        habitId: "habit-1",
      },
    ];

    const existing: CalendarEventExtended[] = [
      {
        id: "g-1",
        name: "Exercise",
        start: new Date("2026-06-22T08:00:00Z"),
        end: new Date("2026-06-22T09:00:00Z"),
        habitId: "habit-1",
      },
    ];

    const result = reconcile(desired, existing);
    expect(result.create.length).toBe(0);
    expect(result.update.length).toBe(1);
    expect(result.delete.length).toBe(0);
    expect(result.update[0].googleEventId).toBe("g-1");
    expect(result.update[0].start.toISOString()).toBe(desired[0].start.toISOString());
  });

  it("does nothing when desired and existing match exactly", () => {
    const desired: PlannedBlock[] = [
      {
        name: "Exercise",
        start: new Date("2026-06-22T08:00:00Z"),
        end: new Date("2026-06-22T09:00:00Z"),
        status: "planned",
        source: "planner",
        habitId: "habit-1",
      },
    ];

    const existing: CalendarEventExtended[] = [
      {
        id: "g-1",
        name: "Exercise",
        start: new Date("2026-06-22T08:00:00Z"),
        end: new Date("2026-06-22T09:00:00Z"),
        habitId: "habit-1",
      },
    ];

    const result = reconcile(desired, existing);
    expect(result.create.length).toBe(0);
    expect(result.update.length).toBe(0);
    expect(result.delete.length).toBe(0);
  });
});
