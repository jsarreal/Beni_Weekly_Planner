import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const startStr = searchParams.get("start");
  const endStr = searchParams.get("end");

  if (!startStr || !endStr) {
    return NextResponse.json({ error: "Missing start or end query parameters" }, { status: 400 });
  }

  try {
    const start = new Date(startStr);
    const end = new Date(endStr);

    const blocks = await prisma.block.findMany({
      where: {
        start: { gte: start },
        end: { lte: end },
      },
      include: {
        habit: true,
        goal: true,
      },
      orderBy: { start: "asc" },
    });

    const mapped = blocks.map(b => ({
      id: b.id,
      start: b.start,
      end: b.end,
      status: b.status,
      googleEventId: b.googleEventId,
      name: b.habit?.name || b.goal?.name || "Untitled Block",
      type: b.habit ? (b.habit.type === "sleep" ? "sleep" : "habit") : "goal",
      habitId: b.habitId,
      goalId: b.goalId,
    }));

    return NextResponse.json(mapped);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || err }, { status: 400 });
  }
}
