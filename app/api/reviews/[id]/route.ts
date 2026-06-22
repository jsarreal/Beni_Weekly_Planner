import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const feedbackSchema = z.object({
  feedback: z.string().min(1),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const json = await req.json();
    const validated = feedbackSchema.parse(json);

    const updated = await prisma.dailyReview.update({
      where: { id },
      data: {
        feedback: validated.feedback,
      },
    });

    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || err }, { status: 400 });
  }
}
