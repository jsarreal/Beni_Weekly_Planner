import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { runDailyReview } from "../lib/agent/review";
import { prisma } from "../lib/db";

vi.mock("../lib/google/oauth", () => ({
  getAuthedClient: vi.fn().mockResolvedValue({}),
}));

vi.mock("../lib/scheduler", () => ({
  runScheduling: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/google/gmail", () => ({
  sendGmailEmail: vi.fn().mockResolvedValue({}),
}));

describe("Daily Review Agent Workflow", () => {
  beforeAll(async () => {
    await prisma.settings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        googleRefresh: "some-refresh-token",
        dayWindows: "{}",
        blackoutDays: "[]",
        agentProvider: "fake", // uses FakeAgentRunner
        email: "owner@example.com",
      },
      update: {
        googleRefresh: "some-refresh-token",
        agentProvider: "fake",
        email: "owner@example.com",
      },
    });
  });

  afterAll(async () => {
    await prisma.habit.deleteMany({});
    await prisma.goal.deleteMany({});
    await prisma.block.deleteMany({});
    await prisma.dailyReview.deleteMany({});
    await prisma.$disconnect();
  });

  it("successfully runs the daily review, logs blocks as done, updates DB and sends email", async () => {
    // 1. Create a goal
    const goal = await prisma.goal.create({
      data: {
        name: "Read Book Test",
        totalEffortMin: 300,
        completedMin: 0,
        deadline: new Date(),
      },
    });

    // 2. Create a block for today
    const block = await prisma.block.create({
      data: {
        start: new Date(),
        end: new Date(Date.now() + 3600_000), // 1 hour block
        status: "planned",
        goalId: goal.id,
      },
    });

    // 3. Run daily review
    const result = await runDailyReview(new Date());
    expect(result.success).toBe(true);
    expect(result.summary).toContain("completed");

    // 4. Verify block status was updated to done
    const updatedBlock = await prisma.block.findUnique({ where: { id: block.id } });
    expect(updatedBlock?.status).toBe("done");

    // 5. Verify goal completed minutes was incremented (by 60 mins)
    const updatedGoal = await prisma.goal.findUnique({ where: { id: goal.id } });
    expect(updatedGoal?.completedMin).toBe(60);

    // 6. Verify DailyReview record exists
    const review = await prisma.dailyReview.findUnique({ where: { id: result.reviewId } });
    expect(review).toBeTruthy();
    expect(review?.summary).toBe(result.summary);
  });
});
