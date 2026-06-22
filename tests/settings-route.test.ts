import { describe, it, expect, afterAll } from "vitest";
import { GET, PUT } from "@/app/api/settings/route";
import { prisma } from "@/lib/db";

describe("settings route", () => {
  it("GET returns settings without token fields", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("timeZone");
    expect(body).not.toHaveProperty("googleRefresh");
  });

  it("PUT updates the timezone", async () => {
    const req = new Request("http://localhost:3000/api/settings", {
      method: "PUT",
      body: JSON.stringify({ timeZone: "Europe/London" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req);
    const body = await res.json();
    expect(body.timeZone).toBe("Europe/London");
  });

  afterAll(async () => { await prisma.$disconnect(); });
});
