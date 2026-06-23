import { NextResponse } from "next/server";
import { syncCalendar } from "@/lib/sync";

export async function GET() {
  console.log("[Sync API] GET /api/sync invoked");
  try {
    const result = await syncCalendar();
    console.log("[Sync API] syncCalendar GET result:", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[Sync API] GET threw:", err?.message ?? err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

export async function POST() {
  console.log("[Sync API] POST /api/sync invoked");
  try {
    const result = await syncCalendar();
    console.log("[Sync API] syncCalendar POST result:", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[Sync API] POST threw:", err?.message ?? err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
