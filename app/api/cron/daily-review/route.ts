import { NextResponse } from "next/server";
import { runDailyReview } from "@/lib/agent/review";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date");
  const reviewDate = dateStr ? new Date(dateStr) : new Date();

  try {
    const result = await runDailyReview(reviewDate);
    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || err }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    let reviewDate = new Date();
    try {
      const json = await req.json();
      if (json.date) reviewDate = new Date(json.date);
    } catch (_) {}

    const result = await runDailyReview(reviewDate);
    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || err }, { status: 500 });
  }
}
