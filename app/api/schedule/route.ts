import { NextResponse } from "next/server";
import { runScheduling } from "@/lib/scheduler";

export async function POST() {
  try {
    await runScheduling();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Schedule Route Error]:", err);
    return NextResponse.json({ error: err.message || err }, { status: 500 });
  }
}
