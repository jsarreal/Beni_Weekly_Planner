import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { goalSchema } from "@/lib/validation";
import { runScheduling } from "@/lib/scheduler";

export async function GET() {
  const goals = await prisma.goal.findMany({
    orderBy: { deadline: "asc" },
  });
  return NextResponse.json(goals);
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const validated = goalSchema.parse(json);

    const goal = await prisma.goal.create({
      data: {
        name: validated.name,
        totalEffortMin: validated.totalEffortMin,
        completedMin: validated.completedMin,
        deadline: validated.deadline,
        earliestStart: validated.earliestStart || new Date(),
        sessionMinMin: validated.sessionMinMin,
        sessionMaxMin: validated.sessionMaxMin,
        timeOfDay: validated.timeOfDay,
        priority: validated.priority,
      },
    });

    // Run scheduler to update calendar
    await runScheduling();

    return NextResponse.json(goal, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || err }, { status: 400 });
  }
}
