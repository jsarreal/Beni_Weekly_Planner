import { prisma } from "@/lib/db";
import { settingsSchema } from "@/lib/validation";

export type DayWindow = {
  wakeTime: string;      // e.g. "06:00"
  sleepTime: string;     // e.g. "22:00"
  workStartTime: string; // e.g. "08:00"
  workEndTime: string;   // e.g. "17:00"
};

const DEFAULT_DAY: DayWindow = {
  wakeTime: "06:00",
  sleepTime: "22:00",
  workStartTime: "08:00",
  workEndTime: "17:00",
};

const DEFAULT_WINDOWS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].reduce(
  (acc, d) => ({ ...acc, [d]: DEFAULT_DAY }),
  {} as Record<string, DayWindow>
);

function minToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export async function getSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  if (existing) {
    try {
      const parsed = JSON.parse(existing.dayWindows || "{}");
      let migrated = false;
      const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
      for (const d of days) {
        if (parsed[d] && parsed[d].wakeMin !== undefined) {
          parsed[d] = {
            wakeTime: minToTime(parsed[d].wakeMin),
            sleepTime: minToTime(parsed[d].sleepMin),
            workStartTime: minToTime(parsed[d].workStartMin),
            workEndTime: minToTime(parsed[d].workEndMin),
          };
          migrated = true;
        }
      }
      if (migrated) {
        const updated = await prisma.settings.update({
          where: { id: 1 },
          data: { dayWindows: JSON.stringify(parsed) },
        });
        return updated;
      }
    } catch (e) {
      console.error("Failed to migrate settings format:", e);
    }
    return existing;
  }
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
