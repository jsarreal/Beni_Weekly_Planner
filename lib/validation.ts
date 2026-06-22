import { z } from "zod";

export const dayWindowSchema = z
  .object({
    wakeMin: z.number().int().min(0).max(1440),
    sleepMin: z.number().int().min(0).max(1440),
    workStartMin: z.number().int().min(0).max(1440),
    workEndMin: z.number().int().min(0).max(1440),
  })
  .refine((w) => w.wakeMin < w.sleepMin, "wake must be before sleep")
  .refine((w) => w.workStartMin <= w.workEndMin, "work start must be <= work end");

export const settingsSchema = z.object({
  timeZone: z.string().min(1).optional(),
  dayWindows: z.record(z.string(), dayWindowSchema).optional(),
  blackoutDays: z.array(z.string()).optional(),
  agentReviewMin: z.number().int().min(0).max(1440).optional(),
  agentProvider: z.enum(["openrouter", "agy", "fake"]).optional(),
  email: z.string().email().nullish(),
});
