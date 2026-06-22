import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { habitUpdateSchema } from "@/lib/validation";
import { runScheduling } from "@/lib/scheduler";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const json = await req.json();
    const validated = habitUpdateSchema.parse(json);

    // Prepare update data
    const updateData: any = { ...validated };
    if (validated.fixedDays) {
      updateData.fixedDays = JSON.stringify(validated.fixedDays);
    }

    const habit = await prisma.habit.update({
      where: { id },
      data: updateData,
    });

    // Run scheduler to update calendar
    await runScheduling();

    return NextResponse.json(habit);
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
    
    await prisma.habit.delete({
      where: { id },
    });

    // Run scheduler to update calendar
    await runScheduling();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || err }, { status: 400 });
  }
}
