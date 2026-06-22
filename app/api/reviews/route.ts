import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const reviews = await prisma.dailyReview.findMany({
      orderBy: { date: "desc" },
    });
    return NextResponse.json(reviews);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || err }, { status: 500 });
  }
}
