import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getAuthedClient } from "@/lib/google/oauth";
import { listAllEvents } from "@/lib/google/calendar";

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

    // Fetch external events if Google Calendar is connected
    const settings = await getSettings();
    let externalEvents: any[] = [];
    if (settings.googleRefresh) {
      try {
        const auth = await getAuthedClient();
        const googleEvents = await listAllEvents(auth, start, end);
        externalEvents = googleEvents
          .filter((e: any) => e.extendedProperties?.private?.beniPlanner !== "1")
          .map((item: any) => ({
            id: item.id || "",
            start: new Date(item.start?.dateTime || item.start?.date || ""),
            end: new Date(item.end?.dateTime || item.end?.date || ""),
            status: "planned",
            googleEventId: item.id || "",
            name: item.summary || "Busy",
            type: "external",
            habitId: undefined,
            goalId: undefined,
          }));
      } catch (err) {
        console.error("[Blocks API] Failed to fetch Google Calendar events:", err);
      }
    }

    return NextResponse.json([...mapped, ...externalEvents]);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || err }, { status: 400 });
  }
}
