import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("googleapis", () => {
  class FakeOAuth2 {
    credentials: Record<string, unknown> = {};
    generateAuthUrl() { return "https://accounts.google.com/o/oauth2/auth?fake=1"; }
    async getToken(code: string) {
      return { tokens: { refresh_token: "r-" + code, access_token: "a-" + code, expiry_date: Date.now() + 3600_000 } };
    }
    setCredentials(c: Record<string, unknown>) { this.credentials = c; }
  }
  return { google: { auth: { OAuth2: FakeOAuth2 } } };
});

import { getAuthUrl, exchangeCode, getAuthedClient } from "@/lib/google/oauth";
import { prisma } from "@/lib/db";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  process.env.GOOGLE_CLIENT_ID = "cid";
  process.env.GOOGLE_CLIENT_SECRET = "csec";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/cb";
});

describe("google oauth", () => {
  it("builds a consent URL", () => {
    expect(getAuthUrl()).toContain("https://accounts.google.com");
  });

  it("exchanges a code and stores an encrypted refresh token", async () => {
    await exchangeCode("xyz");
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(s?.googleRefresh).toBeTruthy();
    expect(s?.googleRefresh).not.toContain("r-xyz"); // stored encrypted
    const client = await getAuthedClient();
    expect(client).toBeTruthy();
  });

  afterAll(async () => { await prisma.$disconnect(); });
});
