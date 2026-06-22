export interface DayWindow {
  wakeTime: string;      // "HH:MM"
  sleepTime: string;     // "HH:MM"
  workStartTime: string; // "HH:MM"
  workEndTime: string;   // "HH:MM"
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

function timeToMin(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

function getTimezoneOffsetMin(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const getVal = (t: string) => {
    const val = parts.find(p => p.type === t)?.value;
    return val ? parseInt(val, 10) : 0;
  };
  const hour = getVal("hour");
  const localUtc = Date.UTC(
    getVal("year"),
    getVal("month") - 1,
    getVal("day"),
    hour === 24 ? 0 : hour,
    getVal("minute"),
    getVal("second")
  );
  return Math.round((date.getTime() - localUtc) / 60000);
}

function createLocalDate(dayStr: string, minutesFromMidnight: number, timeZone: string): Date {
  const baseUtc = new Date(`${dayStr}T00:00:00Z`);
  const candidate = new Date(baseUtc.getTime() + minutesFromMidnight * 60 * 1000);
  const offset = getTimezoneOffsetMin(candidate, timeZone);
  return new Date(candidate.getTime() + offset * 60 * 1000);
}

function getLocalDayOfWeekStr(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
  return formatter.format(date).toLowerCase();
}

function getLocalDateStr(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const d = parts.find(p => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
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
    const dayStr = getLocalDateStr(currentDay, constraints.timeZone);
    const dayOfWeek = getLocalDayOfWeekStr(currentDay, constraints.timeZone);
    const dayWin = constraints.dayWindows[dayOfWeek] || {
      wakeTime: "06:00",
      sleepTime: "22:00",
      workStartTime: "08:00",
      workEndTime: "17:00",
    };

    const nextDay = addMinutes(currentDay, 24 * 60);
    const nextDayStr = getLocalDateStr(nextDay, constraints.timeZone);

    // Sleep interval is from sleepTime of current day to wakeTime of next day
    const sleepStart = createLocalDate(dayStr, timeToMin(dayWin.sleepTime), constraints.timeZone);
    const sleepEnd = createLocalDate(nextDayStr, timeToMin(dayWin.wakeTime), constraints.timeZone);

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
      const dayStr = getLocalDayOfWeekStr(dayCursor, constraints.timeZone);
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
      const dayStr = getLocalDateStr(day, constraints.timeZone);
      const dayOfWeek = getLocalDayOfWeekStr(day, constraints.timeZone);
      const dayWin = constraints.dayWindows[dayOfWeek] || {
        wakeTime: "06:00",
        sleepTime: "22:00",
        workStartTime: "08:00",
        workEndTime: "17:00",
      };

      const wakeMin = timeToMin(dayWin.wakeTime);
      const sleepMin = timeToMin(dayWin.sleepTime);

      // Calculate candidate window based on preference
      let prefStartMin = wakeMin;
      let prefEndMin = sleepMin;
      const awakeSpan = sleepMin - wakeMin;

      if (habit.timeOfDay === "morning") {
        prefEndMin = wakeMin + awakeSpan / 3;
      } else if (habit.timeOfDay === "afternoon") {
        prefStartMin = wakeMin + awakeSpan / 3;
        prefEndMin = wakeMin + (2 * awakeSpan) / 3;
      } else if (habit.timeOfDay === "evening") {
        prefStartMin = wakeMin + (2 * awakeSpan) / 3;
      }

      const startLimit = createLocalDate(dayStr, prefStartMin, constraints.timeZone);
      const endLimit = createLocalDate(dayStr, prefEndMin, constraints.timeZone);

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

  // 5. Place Goals (Distributed evenly across the timeline)
  const goals = items.filter(i => i.type === "goal").sort((a, b) => a.priority - b.priority);
  for (const goal of goals) {
    const totalNeeded = (goal.totalEffortMin || 0) - (goal.completedMin || 0);
    if (totalNeeded <= 0) continue;

    const deadline = goal.deadline || window.end;
    const earliestStart = goal.earliestStart || window.start;
    const sessionMin = goal.sessionMinMin || 30;
    const sessionMax = goal.sessionMaxMin || 120;

    // A. Collect all eligible work days from earliestStart to deadline
    const eligibleDays: Date[] = [];
    let dayCursor = new Date(earliestStart);
    // Align dayCursor to local midnight of the start day
    const startDayStr = getLocalDateStr(dayCursor, constraints.timeZone);
    dayCursor = createLocalDate(startDayStr, 0, constraints.timeZone);

    while (dayCursor <= deadline) {
      const dayOfWeek = getLocalDayOfWeekStr(dayCursor, constraints.timeZone);
      const dayWin = constraints.dayWindows[dayOfWeek];
      if (dayWin && (timeToMin(dayWin.workStartTime) !== 0 || timeToMin(dayWin.workEndTime) !== 0)) {
        eligibleDays.push(new Date(dayCursor));
      }
      dayCursor = addMinutes(dayCursor, 24 * 60);
    }

    // If no eligible days found, fallback to all days in the window
    if (eligibleDays.length === 0) {
      let fallbackCursor = new Date(earliestStart);
      while (fallbackCursor <= deadline) {
        eligibleDays.push(new Date(fallbackCursor));
        fallbackCursor = addMinutes(fallbackCursor, 24 * 60);
      }
    }

    let remainingEffort = totalNeeded;

    // B. Distribute remainingEffort across the eligibleDays
    for (let d = 0; d < eligibleDays.length && remainingEffort > 0; d++) {
      const day = eligibleDays[d];
      const dayOfWeek = getLocalDayOfWeekStr(day, constraints.timeZone);
      const dayStr = getLocalDateStr(day, constraints.timeZone);
      const dayWin = constraints.dayWindows[dayOfWeek] || {
        wakeTime: "06:00",
        sleepTime: "22:00",
        workStartTime: "08:00",
        workEndTime: "17:00",
      };

      const workStartMin = timeToMin(dayWin.workStartTime);
      const workEndMin = timeToMin(dayWin.workEndTime);

      // Target effort for this day is the remaining effort divided by remaining days
      const remainingDays = eligibleDays.length - d;
      let dayTargetEffort = Math.ceil(remainingEffort / remainingDays);
      
      // Cap the day's target by constraints.maxGoalHoursPerDay
      dayTargetEffort = Math.min(dayTargetEffort, constraints.maxGoalHoursPerDay * 60);

      // Calculate candidate work window
      const workStart = createLocalDate(dayStr, workStartMin, constraints.timeZone);
      let workEnd = createLocalDate(dayStr, workEndMin, constraints.timeZone);
      if (workEnd > deadline) {
        workEnd = deadline;
      }

      // Schedule sessions within this day's work window
      let slotCursor = new Date(workStart);
      let scheduledGoalHoursToday = 0;

      while (slotCursor < workEnd && dayTargetEffort > 0 && remainingEffort > 0) {
        const potentialSessionMin = Math.min(sessionMax, dayTargetEffort, remainingEffort);
        if (potentialSessionMin < sessionMin) {
          // If we can't fit at least sessionMin, we can't schedule any more today
          break;
        }
        const sessionLen = Math.max(sessionMin, potentialSessionMin);

        // Daily cap check
        const hoursNeeded = sessionLen / 60;
        if (scheduledGoalHoursToday + hoursNeeded > constraints.maxGoalHoursPerDay) {
          break;
        }

        const candidateEnd = addMinutes(slotCursor, sessionLen);
        if (candidateEnd > workEnd || candidateEnd > deadline) {
          break;
        }

        const candidate = { start: slotCursor, end: candidateEnd };
        const inWindow = candidate.start >= window.start && candidate.end <= window.end;

        if (inWindow) {
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
            dayTargetEffort -= sessionLen;
            scheduledGoalHoursToday += hoursNeeded;
            
            // Move cursor to after this session plus buffer
            slotCursor = addMinutes(candidate.end, constraints.bufferMin);
          } else {
            // Step by 15 mins to find next slot
            slotCursor = addMinutes(slotCursor, 15);
          }
        } else {
          // If outside the rolling planning window, simulate placement
          remainingEffort -= sessionLen;
          dayTargetEffort -= sessionLen;
          scheduledGoalHoursToday += hoursNeeded;
          slotCursor = addMinutes(candidate.end, constraints.bufferMin);
        }
      }
    }
  }

  // Sort blocks chronologically
  return resultBlocks.sort((a, b) => a.start.getTime() - b.start.getTime());
}
