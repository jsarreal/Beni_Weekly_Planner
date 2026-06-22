import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// Mock the scheduler run
vi.mock("../lib/scheduler", () => ({
  runScheduling: vi.fn().mockResolvedValue(undefined),
}));

import { GET as getHabits, POST as postHabits } from "../app/api/habits/route";
import { PUT as putHabit, DELETE as deleteHabit } from "../app/api/habits/[id]/route";
import { GET as getGoals, POST as postGoals } from "../app/api/goals/route";
import { PUT as putGoal, DELETE as deleteGoal } from "../app/api/goals/[id]/route";
import { GET as getBlocks } from "../app/api/blocks/route";
import { PUT as putBlock } from "../app/api/blocks/[id]/route";
import { GET as getReviews } from "../app/api/reviews/route";
import { PUT as putReview } from "../app/api/reviews/[id]/route";
import { prisma } from "../lib/db";

describe("Habits and Goals API Routes", () => {
  beforeAll(async () => {
    await prisma.habit.deleteMany({});
    await prisma.goal.deleteMany({});
    await prisma.block.deleteMany({});
    await prisma.dailyReview.deleteMany({});
  });

  afterAll(async () => {
    await prisma.habit.deleteMany({});
    await prisma.goal.deleteMany({});
    await prisma.block.deleteMany({});
    await prisma.dailyReview.deleteMany({});
    await prisma.$disconnect();
  });

  it("performs CRUD for Habits", async () => {
    // 1. Create a habit
    const reqPost = new Request("http://localhost:3000/api/habits", {
      method: "POST",
      body: JSON.stringify({
        name: "Morning Meds",
        durationMin: 5,
        perWeek: 7,
        timeOfDay: "morning",
        priority: 1,
        fixedDays: [],
        type: "normal",
      }),
      headers: { "content-type": "application/json" },
    });
    const resPost = await postHabits(reqPost);
    expect(resPost.status).toBe(201);
    const habit = await resPost.json();
    expect(habit.name).toBe("Morning Meds");

    // 2. Fetch habits
    const resGet = await getHabits();
    const habits = await resGet.json();
    expect(habits.length).toBeGreaterThan(0);
    expect(habits[0].id).toBe(habit.id);

    // 3. Update habit
    const reqPut = new Request(`http://localhost:3000/api/habits/${habit.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: "Morning Meds Daily" }),
      headers: { "content-type": "application/json" },
    });
    const resPut = await putHabit(reqPut, { params: Promise.resolve({ id: habit.id }) });
    const updatedHabit = await resPut.json();
    expect(updatedHabit.name).toBe("Morning Meds Daily");

    // 4. Delete habit
    const reqDelete = new Request(`http://localhost:3000/api/habits/${habit.id}`, {
      method: "DELETE",
    });
    const resDelete = await deleteHabit(reqDelete, { params: Promise.resolve({ id: habit.id }) });
    expect(resDelete.status).toBe(200);

    const deletedFind = await prisma.habit.findUnique({ where: { id: habit.id } });
    expect(deletedFind).toBeNull();
  });

  it("performs CRUD for Goals", async () => {
    const deadline = new Date("2026-12-31T23:59:59.000Z");
    // 1. Create a goal
    const reqPost = new Request("http://localhost:3000/api/goals", {
      method: "POST",
      body: JSON.stringify({
        name: "Finish Book",
        totalEffortMin: 600,
        completedMin: 60,
        deadline: deadline.toISOString(),
        earliestStart: new Date().toISOString(),
        sessionMinMin: 30,
        sessionMaxMin: 120,
        timeOfDay: "afternoon",
        priority: 2,
      }),
      headers: { "content-type": "application/json" },
    });
    const resPost = await postGoals(reqPost);
    expect(resPost.status).toBe(201);
    const goal = await resPost.json();
    expect(goal.name).toBe("Finish Book");

    // 2. Fetch goals
    const resGet = await getGoals();
    const goals = await resGet.json();
    expect(goals.length).toBeGreaterThan(0);

    // 3. Update goal
    const reqPut = new Request(`http://localhost:3000/api/goals/${goal.id}`, {
      method: "PUT",
      body: JSON.stringify({ completedMin: 120 }),
      headers: { "content-type": "application/json" },
    });
    const resPut = await putGoal(reqPut, { params: Promise.resolve({ id: goal.id }) });
    const updatedGoal = await resPut.json();
    expect(updatedGoal.completedMin).toBe(120);

    // 4. Delete goal
    const reqDelete = new Request(`http://localhost:3000/api/goals/${goal.id}`, {
      method: "DELETE",
    });
    const resDelete = await deleteGoal(reqDelete, { params: Promise.resolve({ id: goal.id }) });
    expect(resDelete.status).toBe(200);
  });

  it("handles block queries and updates", async () => {
    // Create a block in DB
    const block = await prisma.block.create({
      data: {
        start: new Date("2026-06-22T09:00:00Z"),
        end: new Date("2026-06-22T10:00:00Z"),
        status: "planned",
        googleEventId: "google-block-1",
      },
    });

    // Query blocks
    const reqGet = new Request("http://localhost:3000/api/blocks?start=2026-06-22T00:00:00Z&end=2026-06-23T00:00:00Z");
    const resGet = await getBlocks(reqGet);
    const blocks = await resGet.json();
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].id).toBe(block.id);

    // Update status
    const reqPut = new Request(`http://localhost:3000/api/blocks/${block.id}`, {
      method: "PUT",
      body: JSON.stringify({ status: "done" }),
      headers: { "content-type": "application/json" },
    });
    const resPut = await putBlock(reqPut, { params: Promise.resolve({ id: block.id }) });
    const updatedBlock = await resPut.json();
    expect(updatedBlock.status).toBe("done");
  });

  it("handles daily review queries and updates", async () => {
    // Create a review
    const review = await prisma.dailyReview.create({
      data: {
        date: new Date(),
        summary: "Day review summary text",
        adjustments: "{}",
      },
    });

    // Query reviews
    const resGet = await getReviews();
    const reviews = await resGet.json();
    expect(reviews.length).toBeGreaterThan(0);
    expect(reviews[0].id).toBe(review.id);

    // Update feedback
    const reqPut = new Request(`http://localhost:3000/api/reviews/${review.id}`, {
      method: "PUT",
      body: JSON.stringify({ feedback: "I feel great about today!" }),
      headers: { "content-type": "application/json" },
    });
    const resPut = await putReview(reqPut, { params: Promise.resolve({ id: review.id }) });
    const updatedReview = await resPut.json();
    expect(updatedReview.feedback).toBe("I feel great about today!");
  });
});

