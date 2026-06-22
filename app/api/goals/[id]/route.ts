import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { goalUpdateSchema } from "@/lib/validation";
import { runScheduling } from "@/lib/scheduler";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const json = await req.json();
    const validated = goalUpdateSchema.parse(json);

    const goal = await prisma.goal.update({
      where: { id },
      data: validated,
    });

    // Run scheduler to update calendar
    try {
      await runScheduling();
    } catch (schedErr) {
      console.error("[PUT Goal Route] Scheduling update failed:", schedErr);
    }

    return NextResponse.json(goal);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || err }, { status: 400 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    await prisma.goal.delete({
      where: { id },
    });

    // Run scheduler to update calendar
    try {
      await runScheduling();
    } catch (schedErr) {
      console.error("[DELETE Goal Route] Scheduling update failed:", schedErr);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || err }, { status: 400 });
  }
}
