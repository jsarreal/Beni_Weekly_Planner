import { prisma } from "@/lib/db";
import { settingsSchema } from "@/lib/validation";

export type DayWindow = {
  wakeMin: number;
  sleepMin: number;
  workStartMin: number;
  workEndMin: number;
};

const DEFAULT_DAY: DayWindow = { wakeMin: 420, sleepMin: 1380, workStartMin: 540, workEndMin: 1020 };
const DEFAULT_WINDOWS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].reduce(
  (acc, d) => ({ ...acc, [d]: DEFAULT_DAY }),
  {} as Record<string, DayWindow>
);

export async function getSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
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
