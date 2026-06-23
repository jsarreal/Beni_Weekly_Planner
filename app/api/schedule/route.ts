import { NextResponse } from "next/server";
import { runScheduling } from "@/lib/scheduler";

export async function POST() {
  console.log("[Schedule API] POST /api/schedule invoked");
  try {
    await runScheduling();
    console.log("[Schedule API] runScheduling completed successfully");
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Schedule API] runScheduling threw:", err?.message ?? err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
