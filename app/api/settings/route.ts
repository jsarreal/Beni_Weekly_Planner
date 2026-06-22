import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/settings";
import { runScheduling } from "@/lib/scheduler";

function sanitize(s: Awaited<ReturnType<typeof getSettings>>) {
  const { googleRefresh, googleAccessTok, googleTokenExp, ...safe } = s;
  return { ...safe, connected: Boolean(googleRefresh) };
}

export async function GET() {
  return NextResponse.json(sanitize(await getSettings()));
}

export async function PUT(req: Request) {
  try {
    const updated = await updateSettings(await req.json());
    // Run scheduler to update calendar with new settings/constraints
    await runScheduling();
    return NextResponse.json(sanitize(updated));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

