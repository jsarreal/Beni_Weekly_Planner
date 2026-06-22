import { getAuthedClient } from "./google/oauth";
import { getSettings } from "./settings";
import { prisma } from "./db";
import { plan, PlanItem, CalendarEvent, PlannedBlock, PlanConstraints } from "./engine";
import { reconcile } from "./reconcile";
import {
  createPlannerEvent,
  updatePlannerEvent,
  deletePlannerEvent,
  listAllEvents,
  listPlannerEvents,
} from "./google/calendar";

export async function runScheduling(): Promise<void> {
  // 1. Check Google OAuth connection
  const settings = await getSettings();
  if (!settings.googleRefresh) {
    console.log("[Scheduler] Google Calendar not connected, skipping scheduling.");
    return;
  }

  // 2. Setup scheduling window: rolling 14 days
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const windowStart = startOfToday;
  const windowEnd = new Date(startOfToday.getTime() + 14 * 24 * 60 * 60 * 1000);

  // 3. Fetch active Habits and Goals
  const habits = await prisma.habit.findMany();
  const goals = await prisma.goal.findMany();

  // Map habits and goals to PlanItem
  const planItems: PlanItem[] = [
    ...habits.map(h => ({
      id: h.id,
      name: h.name,
      type: (h.type === "sleep" ? "sleep" as const : "habit" as const),
      priority: h.priority,
      durationMin: h.durationMin,
      perWeek: h.perWeek,
      fixedDays: JSON.parse(h.fixedDays || "[]"),
      timeOfDay: h.timeOfDay as any,
    })),
    ...goals.map(g => ({
      id: g.id,
      name: g.name,
      type: "goal" as const,
      priority: g.priority,
      durationMin: 60, // engine expects durationMin, though goals use sessionMinMin/sessionMaxMin
      totalEffortMin: g.totalEffortMin,
      completedMin: g.completedMin,
      deadline: g.deadline,
      earliestStart: g.earliestStart,
      sessionMinMin: g.sessionMinMin,
      sessionMaxMin: g.sessionMaxMin,
      timeOfDay: g.timeOfDay as any,
    }))
  ];

  // 4. Fetch busy events from Google Calendar
  const auth = await getAuthedClient();
  const googleEvents = await listAllEvents(auth, windowStart, windowEnd);

  const existingEvents: CalendarEvent[] = googleEvents.map((item: any) => ({
    id: item.id || "",
    start: new Date(item.start?.dateTime || item.start?.date || ""),
    end: new Date(item.end?.dateTime || item.end?.date || ""),
    isPlannerBlock: item.extendedProperties?.private?.beniPlanner === "1",
  }));

  // 5. Construct constraints
  const dayWindows = JSON.parse(settings.dayWindows || "{}");
  const blackoutDays = JSON.parse(settings.blackoutDays || "[]");

  const constraints: PlanConstraints = {
    timeZone: settings.timeZone,
    dayWindows,
    blackoutDays,
    bufferMin: 15,
    maxGoalHoursPerDay: 4,
  };

  // 6. Run Scheduling Engine
  const desiredBlocks = plan(planItems, constraints, existingEvents, { start: windowStart, end: windowEnd });

  // 7. Run Reconciliation
  const reconcileEvents = googleEvents
    .filter((e: any) => e.extendedProperties?.private?.beniPlanner === "1")
    .map((item: any) => ({
      id: item.id || "",
      name: item.summary || "",
      start: new Date(item.start?.dateTime || item.start?.date || ""),
      end: new Date(item.end?.dateTime || item.end?.date || ""),
      habitId: item.extendedProperties?.private?.habitId,
      goalId: item.extendedProperties?.private?.goalId,
    }));

  const diff = reconcile(desiredBlocks, reconcileEvents);

  // 8. Apply Diff to Google Calendar and Database
  
  // A. Deletes
  for (const googleEventId of diff.delete) {
    try {
      await deletePlannerEvent(auth, googleEventId);
      await prisma.block.deleteMany({
        where: { googleEventId },
      });
    } catch (err) {
      console.error(`[Scheduler] Failed to delete event ${googleEventId}:`, err);
    }
  }

  // B. Updates
  for (const block of diff.update) {
    try {
      await updatePlannerEvent(auth, block.googleEventId, block);
      await prisma.block.updateMany({
        where: { googleEventId: block.googleEventId },
        data: {
          start: block.start,
          end: block.end,
        },
      });
    } catch (err) {
      console.error(`[Scheduler] Failed to update event ${block.googleEventId}:`, err);
    }
  }

  // C. Creates
  for (const block of diff.create) {
    try {
      const createdEvent = await createPlannerEvent(auth, block);
      const googleEventId = createdEvent.id;

      await prisma.block.create({
        data: {
          start: block.start,
          end: block.end,
          status: "planned",
          googleEventId,
          habitId: block.habitId,
          goalId: block.goalId,
        },
      });
    } catch (err) {
      console.error(`[Scheduler] Failed to create event for block ${block.name}:`, err);
    }
  }

  // D. Cleanup Database Blocks
  const finalGooglePlannerEvents = await listPlannerEvents(auth, windowStart, windowEnd);
  const finalGoogleEventIds = finalGooglePlannerEvents.map(e => e.id);
  
  await prisma.block.deleteMany({
    where: {
      start: { gte: windowStart },
      end: { lte: windowEnd },
      googleEventId: { notIn: finalGoogleEventIds },
    },
  });

  for (const ev of finalGooglePlannerEvents) {
    const exists = await prisma.block.findFirst({ where: { googleEventId: ev.id } });
    if (!exists) {
      await prisma.block.create({
        data: {
          start: ev.start,
          end: ev.end,
          status: "planned",
          googleEventId: ev.id,
          habitId: ev.habitId,
          goalId: ev.goalId,
        },
      });
    }
  }
}
