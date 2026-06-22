export interface DayWindow {
  wakeMin: number;
  sleepMin: number;
  workStartMin: number;
  workEndMin: number;
}

export interface PlanConstraints {
  timeZone: string;
  dayWindows: Record<string, DayWindow>; // mon..sun
  blackoutDays: string[]; // YYYY-MM-DD
  bufferMin: number;
  maxGoalHoursPerDay: number;
}

export interface PlanItem {
  id: string;
  name: string;
  type: "habit" | "goal" | "sleep";
  priority: number;
  durationMin: number;
  // Goal specific
  totalEffortMin?: number;
  completedMin?: number;
  deadline?: Date;
  earliestStart?: Date;
  sessionMinMin?: number;
  sessionMaxMin?: number;
  // Habit specific
  perWeek?: number;
  fixedDays?: string[];
  timeOfDay?: "morning" | "afternoon" | "evening" | "any";
}

export interface CalendarEvent {
  id: string;
  start: Date;
  end: Date;
  isPlannerBlock?: boolean;
}

export interface PlannedBlock {
  id?: string;
  name: string;
  start: Date;
  end: Date;
  status: "planned" | "done" | "partial" | "skipped";
  source: "planner";
  habitId?: string;
  goalId?: string;
}

interface TimeRange {
  start: Date;
  end: Date;
}

function getDayOfWeekStr(date: Date): string {
  const dayIndex = date.getUTCDay(); // 0 is Sunday, 1 is Monday
  const mapping = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return mapping[dayIndex];
}

function isOverlap(r1: TimeRange, r2: TimeRange, bufferMin = 0): boolean {
  const r1Start = r1.start.getTime() - bufferMin * 60 * 1000;
  const r1End = r1.end.getTime() + bufferMin * 60 * 1000;
  return r1Start < r2.end.getTime() && r1End > r2.start.getTime();
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function plan(
  items: PlanItem[],
  constraints: PlanConstraints,
  existingEvents: CalendarEvent[],
  window: { start: Date; end: Date }
): PlannedBlock[] {
  const resultBlocks: PlannedBlock[] = [];
  const busyRanges: TimeRange[] = [];

  // 1. Mark existing non-planner events as busy
  for (const ev of existingEvents) {
    if (!ev.isPlannerBlock) {
      busyRanges.push({ start: ev.start, end: ev.end });
    }
  }

  // 2. Mark blackout days as busy
  for (const boDay of constraints.blackoutDays) {
    const dayStart = new Date(`${boDay}T00:00:00Z`);
    const dayEnd = new Date(`${boDay}T23:59:59Z`);
    busyRanges.push({ start: dayStart, end: dayEnd });
  }

  // 3. Generate Sleep Blocks (Fixed sleep/wake blocks for each day)
  const sleepHabits = items.filter(i => i.type === "sleep");
  const hasSleepHabit = sleepHabits.length > 0;

  let currentDay = new Date(window.start);
  while (currentDay < window.end) {
    const dayStr = getDayOfWeekStr(currentDay);
    const dayWin = constraints.dayWindows[dayStr] || { wakeMin: 420, sleepMin: 1320 };

    // Sleep interval is from sleepMin of current day to wakeMin of next day
    const sleepStart = addMinutes(new Date(currentDay.toISOString().split("T")[0] + "T00:00:00Z"), dayWin.sleepMin);
    const sleepEnd = addMinutes(new Date(currentDay.toISOString().split("T")[0] + "T00:00:00Z"), 24 * 60 + dayWin.wakeMin);

    if (hasSleepHabit) {
      const block: PlannedBlock = {
        name: "Sleep",
        start: sleepStart,
        end: sleepEnd,
        status: "planned",
        source: "planner",
        habitId: sleepHabits[0].id,
      };
      resultBlocks.push(block);
    }
    // Always treat sleep times as busy ranges for other items
    busyRanges.push({ start: sleepStart, end: sleepEnd });

    currentDay = addMinutes(currentDay, 24 * 60);
  }

  // Sort busy ranges
  busyRanges.sort((a, b) => a.start.getTime() - b.start.getTime());

  // 4. Sort and place Habits
  const habits = items.filter(i => i.type === "habit").sort((a, b) => a.priority - b.priority);
  for (const habit of habits) {
    const perWeek = habit.perWeek || 1;
    const fixedDays = habit.fixedDays || [];
    const duration = habit.durationMin;

    // Distribute across the week
    let daysToSchedule: Date[] = [];
    let dayCursor = new Date(window.start);
    while (dayCursor < window.end) {
      const dayStr = getDayOfWeekStr(dayCursor);
      if (fixedDays.length === 0 || fixedDays.includes(dayStr)) {
        daysToSchedule.push(new Date(dayCursor));
      }
      dayCursor = addMinutes(dayCursor, 24 * 60);
    }

    // Slice to match frequency (even spacing)
    if (fixedDays.length === 0 && daysToSchedule.length > perWeek) {
      const step = daysToSchedule.length / perWeek;
      daysToSchedule = Array.from({ length: perWeek }, (_, i) => daysToSchedule[Math.floor(i * step)]);
    }

    for (const day of daysToSchedule) {
      const dayStr = getDayOfWeekStr(day);
      const dayWin = constraints.dayWindows[dayStr] || { wakeMin: 420, sleepMin: 1320 };

      // Calculate candidate window based on preference
      let prefStartMin = dayWin.wakeMin;
      let prefEndMin = dayWin.sleepMin;
      const awakeSpan = dayWin.sleepMin - dayWin.wakeMin;

      if (habit.timeOfDay === "morning") {
        prefEndMin = dayWin.wakeMin + awakeSpan / 3;
      } else if (habit.timeOfDay === "afternoon") {
        prefStartMin = dayWin.wakeMin + awakeSpan / 3;
        prefEndMin = dayWin.wakeMin + (2 * awakeSpan) / 3;
      } else if (habit.timeOfDay === "evening") {
        prefStartMin = dayWin.wakeMin + (2 * awakeSpan) / 3;
      }

      const baseDayIso = day.toISOString().split("T")[0];
      const startLimit = addMinutes(new Date(baseDayIso + "T00:00:00Z"), prefStartMin);
      const endLimit = addMinutes(new Date(baseDayIso + "T00:00:00Z"), prefEndMin);

      // Search for first free slot of size `duration`
      let slotCursor = new Date(startLimit);
      let placed = false;
      while (addMinutes(slotCursor, duration) <= endLimit) {
        const candidate = { start: slotCursor, end: addMinutes(slotCursor, duration) };
        const conflicted = busyRanges.some(b => isOverlap(candidate, b, constraints.bufferMin)) ||
                             resultBlocks.some(b => isOverlap(candidate, b, constraints.bufferMin));

        if (!conflicted) {
          const block: PlannedBlock = {
            name: habit.name,
            start: candidate.start,
            end: candidate.end,
            status: "planned",
            source: "planner",
            habitId: habit.id,
          };
          resultBlocks.push(block);
          busyRanges.push(candidate);
          busyRanges.sort((a, b) => a.start.getTime() - b.start.getTime());
          placed = true;
          break;
        }
        slotCursor = addMinutes(slotCursor, 15); // step by 15 mins
      }
    }
  }

  // 5. Place Goals (Working backwards from deadline)
  const goals = items.filter(i => i.type === "goal").sort((a, b) => a.priority - b.priority);
  for (const goal of goals) {
    const totalNeeded = (goal.totalEffortMin || 0) - (goal.completedMin || 0);
    if (totalNeeded <= 0) continue;

    const deadline = goal.deadline || window.end;
    const earliestStart = goal.earliestStart || window.start;
    const sessionMin = goal.sessionMinMin || 30;
    const sessionMax = goal.sessionMaxMin || 120;

    let remainingEffort = totalNeeded;

    // We search day-by-day backwards from deadline
    let dayCursor = new Date(deadline);
    // Align dayCursor to the beginning of the day (UTC)
    dayCursor = new Date(dayCursor.toISOString().split("T")[0] + "T00:00:00Z");

    while (dayCursor >= earliestStart && remainingEffort > 0) {
      const dayStr = getDayOfWeekStr(dayCursor);
      const dayWin = constraints.dayWindows[dayStr];
      if (!dayWin || dayWin.workStartMin === 0 && dayWin.workEndMin === 0) {
        // No work on this day
        dayCursor = addMinutes(dayCursor, -24 * 60);
        continue;
      }

      // Check daily cap
      let scheduledGoalHoursToday = 0;
      const baseDayIso = dayCursor.toISOString().split("T")[0];
      const workStart = addMinutes(new Date(baseDayIso + "T00:00:00Z"), dayWin.workStartMin);
      const workEnd = addMinutes(new Date(baseDayIso + "T00:00:00Z"), dayWin.workEndMin);

      // Search backwards within working hours
      let slotCursor = new Date(workEnd);
      while (slotCursor >= workStart && remainingEffort > 0) {
        const potentialSessionMin = Math.min(sessionMax, remainingEffort);
        if (potentialSessionMin < sessionMin && remainingEffort >= sessionMin) {
          // If we can't fit at least sessionMin, skip
          break;
        }
        const sessionLen = Math.max(sessionMin, potentialSessionMin);

        // Verify if we can schedule a session of sessionLen ending at slotCursor
        const candidateStart = addMinutes(slotCursor, -sessionLen);
        if (candidateStart < workStart || candidateStart < earliestStart) {
          slotCursor = addMinutes(slotCursor, -15);
          continue;
        }

        // Daily cap enforcement
        const hoursNeeded = sessionLen / 60;
        if (scheduledGoalHoursToday + hoursNeeded > constraints.maxGoalHoursPerDay) {
          slotCursor = addMinutes(slotCursor, -15);
          continue;
        }

        const candidate = { start: candidateStart, end: slotCursor };
        const conflicted = busyRanges.some(b => isOverlap(candidate, b, constraints.bufferMin)) ||
                             resultBlocks.some(b => isOverlap(candidate, b, constraints.bufferMin));

        if (!conflicted) {
          const block: PlannedBlock = {
            name: goal.name,
            start: candidate.start,
            end: candidate.end,
            status: "planned",
            source: "planner",
            goalId: goal.id,
          };
          resultBlocks.push(block);
          busyRanges.push(candidate);
          busyRanges.sort((a, b) => a.start.getTime() - b.start.getTime());
          remainingEffort -= sessionLen;
          scheduledGoalHoursToday += hoursNeeded;
          
          // Move cursor to before the newly placed session
          slotCursor = addMinutes(candidate.start, -constraints.bufferMin);
        } else {
          slotCursor = addMinutes(slotCursor, -15);
        }
      }

      dayCursor = addMinutes(dayCursor, -24 * 60);
    }
  }

  // Sort blocks chronologically
  return resultBlocks.sort((a, b) => a.start.getTime() - b.start.getTime());
}
