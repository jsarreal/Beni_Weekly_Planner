import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { habitSchema } from "@/lib/validation";
import { runScheduling } from "@/lib/scheduler";

export async function GET() {
  const habits = await prisma.habit.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(habits);
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const validated = habitSchema.parse(json);
    
    const habit = await prisma.habit.create({
      data: {
        name: validated.name,
        durationMin: validated.durationMin,
        perWeek: validated.perWeek,
        timeOfDay: validated.timeOfDay,
        priority: validated.priority,
        fixedDays: JSON.stringify(validated.fixedDays),
        type: validated.type,
      },
    });

    // Run scheduler to update calendar
    await runScheduling();

    return NextResponse.json(habit, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || err }, { status: 400 });
  }
}
