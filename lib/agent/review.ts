import { getSettings } from "../settings";
import { prisma } from "../db";
import { getAgentRunner, ReviewInput } from "./runner";
import { sendGmailEmail } from "../google/gmail";
import { getAuthedClient } from "../google/oauth";
import { runScheduling } from "../scheduler";

export async function runDailyReview(reviewDate: Date): Promise<{ success: boolean; summary: string; reviewId?: string; error?: string }> {
  // 1. Get settings and verify connection
  const settings = await getSettings();
  if (!settings.googleRefresh) {
    return { success: false, summary: "", error: "Google Calendar not connected" };
  }

  // 2. Compute date bounds (start and end of the review date in UTC)
  const startOfDay = new Date(Date.UTC(reviewDate.getUTCFullYear(), reviewDate.getUTCMonth(), reviewDate.getUTCDate(), 0, 0, 0));
  const endOfDay = new Date(Date.UTC(reviewDate.getUTCFullYear(), reviewDate.getUTCMonth(), reviewDate.getUTCDate(), 23, 59, 59, 999));

  // 3. Fetch scheduled blocks for today
  const todayBlocks = await prisma.block.findMany({
    where: {
      start: { gte: startOfDay, lte: endOfDay },
    },
    include: {
      habit: true,
      goal: true,
    },
  });

  // 4. Fetch all active habits and goals
  const habits = await prisma.habit.findMany();
  const goals = await prisma.goal.findMany();

  // 5. Construct Review Input payload
  const input: ReviewInput = {
    date: reviewDate,
    todayBlocks: todayBlocks.map(b => ({
      id: b.id,
      name: b.habit?.name || b.goal?.name || "Untitled Block",
      type: b.habit ? (b.habit.type === "sleep" ? "sleep" as const : "habit" as const) : "goal" as const,
      status: b.status,
      durationMin: Math.round((b.end.getTime() - b.start.getTime()) / (60 * 1000)),
      habitId: b.habitId,
      goalId: b.goalId,
    })),
    habits: habits.map(h => ({
      id: h.id,
      name: h.name,
      perWeek: h.perWeek,
      durationMin: h.durationMin,
      priority: h.priority,
    })),
    goals: goals.map(g => ({
      id: g.id,
      name: g.name,
      totalEffortMin: g.totalEffortMin,
      completedMin: g.completedMin,
      deadline: g.deadline,
      priority: g.priority,
    })),
  };

  try {
    // 6. Run LLM review
    const runner = getAgentRunner(settings.agentProvider);
    console.log(`[Review] Running agent review via provider: ${settings.agentProvider}...`);
    const result = await runner.runReview(input);

    // 7. Save DailyReview to DB
    const dailyReview = await prisma.dailyReview.create({
      data: {
        date: reviewDate,
        summary: result.summary,
        adjustments: JSON.stringify(result.adjustments),
      },
    });

    // 8. Apply adjustments autonomously
    const { blockStatusUpdates, goalPriorityUpdates, goalCompletedMinUpdates } = result.adjustments;

    // A. Update blocks status
    if (blockStatusUpdates && blockStatusUpdates.length > 0) {
      for (const update of blockStatusUpdates) {
        const block = todayBlocks.find(b => b.id === update.blockId);
        if (!block) continue;

        // If status changed to done, increment completed minutes on the corresponding Goal
        if (update.status === "done" && block.goalId && block.status !== "done") {
          const durationMin = Math.round((block.end.getTime() - block.start.getTime()) / (60 * 1000));
          await prisma.goal.update({
            where: { id: block.goalId },
            data: { completedMin: { increment: durationMin } },
          });
        }

        await prisma.block.update({
          where: { id: update.blockId },
          data: { status: update.status },
        });
      }
    }

    // B. Update Goal priorities
    if (goalPriorityUpdates && goalPriorityUpdates.length > 0) {
      for (const update of goalPriorityUpdates) {
        await prisma.goal.update({
          where: { id: update.goalId },
          data: { priority: update.priority },
        });
      }
    }

    // C. Update Goal completed minutes
    if (goalCompletedMinUpdates && goalCompletedMinUpdates.length > 0) {
      for (const update of goalCompletedMinUpdates) {
        await prisma.goal.update({
          where: { id: update.goalId },
          data: { completedMin: update.completedMin },
        });
      }
    }

    // 9. Replan based on the adjustments
    await runScheduling();

    // 10. Send Email notification if email exists
    if (settings.email) {
      const auth = await getAuthedClient();
      const subject = `Beni's Daily Review: ${reviewDate.toISOString().split("T")[0]}`;
      
      const adjustmentsHtml = [
        blockStatusUpdates && blockStatusUpdates.length > 0 ? `<li><strong>Blocks Completed:</strong> ${blockStatusUpdates.filter(u => u.status === "done").length} items updated to completed.</li>` : "",
        goalPriorityUpdates && goalPriorityUpdates.length > 0 ? `<li><strong>Goal Priorities Updated:</strong> Bounded/lagging goals priority adjusted.</li>` : "",
        goalCompletedMinUpdates && goalCompletedMinUpdates.length > 0 ? `<li><strong>Progress Increments Applied:</strong> Goal progress logged.</li>` : "",
      ].filter(Boolean).join("");

      const bodyText = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937; line-height: 1.6;">
          <h2 style="color: #6d28d9; border-bottom: 2px solid #e9d5ff; padding-bottom: 8px;">Beni's Daily Progress Coaching</h2>
          <p style="font-size: 1.05rem; font-weight: 500;">Here is the daily coaching recap for ${reviewDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}:</p>
          
          <blockquote style="background-color: #f3e8ff; border-left: 4px solid #8b5cf6; padding: 12px 16px; margin: 18px 0; font-style: italic;">
            ${result.summary}
          </blockquote>

          ${adjustmentsHtml ? `
            <h3 style="color: #3b82f6;">Adjustments Applied:</h3>
            <ul style="padding-left: 20px;">
              ${adjustmentsHtml}
            </ul>
          ` : "<p>No priority or progress adjustments were required today.</p>"}

          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 0.85rem; color: #6b7280; text-align: center;">
            Beni Planner &bull; Automated scheduling tailored to your busy calendar.
          </p>
        </div>
      `;

      try {
        await sendGmailEmail(auth, settings.email, subject, bodyText);
        console.log(`[Review] Daily review email sent to: ${settings.email}`);
      } catch (emailErr) {
        console.error("[Review] Failed to send summary email:", emailErr);
      }
    }

    return { success: true, summary: result.summary, reviewId: dailyReview.id };
  } catch (err: any) {
    console.error("[Review] Daily review failed:", err);
    return { success: false, summary: "", error: err.message || err };
  }
}
