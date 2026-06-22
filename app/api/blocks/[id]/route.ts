import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const blockUpdateSchema = z.object({
  status: z.enum(["planned", "done", "partial", "skipped"]),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const json = await req.json();
    const validated = blockUpdateSchema.parse(json);

    const block = await prisma.block.update({
      where: { id },
      data: {
        status: validated.status,
      },
    });

    return NextResponse.json(block);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || err }, { status: 400 });
  }
}
