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

export const habitSchema = z.object({
  name: z.string().min(1, "Name is required"),
  durationMin: z.number().int().positive("Duration must be positive"),
  perWeek: z.number().int().min(1).max(7, "Frequency must be between 1 and 7"),
  timeOfDay: z.enum(["morning", "afternoon", "evening", "any"]).default("any"),
  priority: z.number().int().min(1).max(5).default(3),
  fixedDays: z.array(z.string()).default([]),
  type: z.enum(["normal", "sleep"]).default("normal"),
});

export const habitUpdateSchema = habitSchema.partial();

export const goalSchema = z.object({
  name: z.string().min(1, "Name is required"),
  totalEffortMin: z.number().int().positive("Total effort must be positive"),
  completedMin: z.number().int().nonnegative().default(0),
  deadline: z.string().transform(val => new Date(val)),
  earliestStart: z.string().transform(val => new Date(val)).optional(),
  sessionMinMin: z.number().int().positive().default(30),
  sessionMaxMin: z.number().int().positive().default(120),
  timeOfDay: z.enum(["morning", "afternoon", "evening", "any"]).default("any"),
  priority: z.number().int().min(1).max(5).default(3),
});

export const goalUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  totalEffortMin: z.number().int().positive().optional(),
  completedMin: z.number().int().nonnegative().optional(),
  deadline: z.string().transform(val => new Date(val)).optional(),
  earliestStart: z.string().transform(val => new Date(val)).optional(),
  sessionMinMin: z.number().int().positive().optional(),
  sessionMaxMin: z.number().int().positive().optional(),
  timeOfDay: z.enum(["morning", "afternoon", "evening", "any"]).optional(),
  priority: z.number().int().min(1).max(5).optional(),
});

