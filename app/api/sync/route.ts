import { NextResponse } from "next/server";
import { syncCalendar } from "@/lib/sync";

export async function GET() {
  try {
    const result = await syncCalendar();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || err }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await syncCalendar();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || err }, { status: 500 });
  }
}
