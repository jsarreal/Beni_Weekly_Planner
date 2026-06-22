import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";

describe("data model", () => {
  it("creates a habit and reads it back", async () => {
    const h = await prisma.habit.create({
      data: { name: "Exercise", durationMin: 45, perWeek: 3, timeOfDay: "morning" },
    });
    const found = await prisma.habit.findUnique({ where: { id: h.id } });
    expect(found?.name).toBe("Exercise");
    expect(found?.perWeek).toBe(3);
    await prisma.habit.delete({ where: { id: h.id } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
