import { describe, it, expect, vi } from "vitest";
import {
  listPlannerEvents,
  createPlannerEvent,
  updatePlannerEvent,
  deletePlannerEvent,
} from "../../lib/google/calendar";

// Mock googleapis
vi.mock("googleapis", () => {
  const mockEventsList = vi.fn().mockResolvedValue({
    data: {
      items: [
        {
          id: "event-1",
          summary: "Exercise",
          start: { dateTime: "2026-06-22T08:00:00Z" },
          end: { dateTime: "2026-06-22T09:00:00Z" },
          extendedProperties: { private: { beniPlanner: "1", habitId: "habit-1" } },
        },
      ],
    },
  });

  const mockEventsInsert = vi.fn().mockResolvedValue({
    data: { id: "new-event-id" },
  });

  const mockEventsUpdate = vi.fn().mockResolvedValue({
    data: { id: "updated-event-id" },
  });

  const mockEventsDelete = vi.fn().mockResolvedValue({});

  const mockCalendar = {
    events: {
      list: mockEventsList,
      insert: mockEventsInsert,
      update: mockEventsUpdate,
      delete: mockEventsDelete,
    },
  };

  return {
    google: {
      calendar: () => mockCalendar,
    },
  };
});

import { google } from "googleapis";

describe("Google Calendar Integration", () => {
  const mockAuth: any = {};

  it("lists planner events filtered by the private tag", async () => {
    const events = await listPlannerEvents(mockAuth, new Date(), new Date());
    expect(events.length).toBe(1);
    expect(events[0].id).toBe("event-1");
    expect(events[0].habitId).toBe("habit-1");
  });

  it("creates a planner event with private property tagging", async () => {
    const block: any = {
      name: "Study",
      start: new Date("2026-06-22T10:00:00Z"),
      end: new Date("2026-06-22T11:00:00Z"),
      habitId: "habit-2",
    };

    const res = await createPlannerEvent(mockAuth, block);
    expect(res.id).toBe("new-event-id");
  });

  it("updates an event", async () => {
    const block: any = {
      name: "Study Extended",
      start: new Date("2026-06-22T10:00:00Z"),
      end: new Date("2026-06-22T12:00:00Z"),
      habitId: "habit-2",
    };

    const res = await updatePlannerEvent(mockAuth, "event-1", block);
    expect(res.id).toBe("updated-event-id");
  });

  it("deletes an event", async () => {
    await deletePlannerEvent(mockAuth, "event-1");
    // Verify mock delete was called
    const calendarInstance = google.calendar({ version: "v3", auth: mockAuth });
    expect(calendarInstance.events.delete).toHaveBeenCalled();
  });
});
