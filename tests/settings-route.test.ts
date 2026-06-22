import { describe, it, expect, afterAll } from "vitest";
import { GET, PUT } from "@/app/api/settings/route";
import { prisma } from "@/lib/db";

describe("settings route", () => {
  it("GET returns settings without token fields", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("timeZone");
    expect(body).not.toHaveProperty("googleRefresh");
    expect(body).not.toHaveProperty("googleAccessTok");
    expect(body).not.toHaveProperty("googleTokenExp");
    expect(body).toHaveProperty("connected");
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

  it("PUT returns 400 for invalid input", async () => {
    const req = new Request("http://localhost:3000/api/settings", {
      method: "PUT",
      body: JSON.stringify({ timeZone: 12345 }), // invalid type
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  afterAll(async () => { await prisma.$disconnect(); });
});
