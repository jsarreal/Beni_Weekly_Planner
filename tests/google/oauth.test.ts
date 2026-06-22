import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("googleapis", () => {
  class FakeOAuth2 {
    credentials: Record<string, unknown> = {};
    _handlers: Record<string, (payload: unknown) => void> = {};
    generateAuthUrl() { return "https://accounts.google.com/o/oauth2/auth?fake=1"; }
    async getToken(code: string) {
      return { tokens: { refresh_token: "r-" + code, access_token: "a-" + code, expiry_date: Date.now() + 3600_000 } };
    }
    setCredentials(c: Record<string, unknown>) { this.credentials = c; }
    on(event: string, cb: (payload: unknown) => void) {
      this._handlers ??= {};
      this._handlers[event] = cb;
    }
    emit(event: string, payload: unknown) {
      if (this._handlers?.[event]) {
        this._handlers[event](payload);
      }
    }
  }
  return { google: { auth: { OAuth2: FakeOAuth2 } } };
});

import { getAuthUrl, exchangeCode, getAuthedClient } from "@/lib/google/oauth";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

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
    // Fix A: assert the access token is also stored encrypted
    expect(s?.googleAccessTok).toBeTruthy();
    expect(s?.googleAccessTok).not.toContain("a-xyz"); // stored encrypted, not plaintext
    const client = await getAuthedClient();
    expect(client).toBeTruthy();
  });

  it("persists a refreshed access token (encrypted)", async () => {
    // Ensure a connection exists
    await exchangeCode("xyz");

    // getAuthedClient registers the tokens handler on the returned client
    const client = await getAuthedClient() as unknown as {
      emit: (event: string, payload: unknown) => void;
    };

    // Simulate Google issuing a refreshed token
    client.emit("tokens", { access_token: "a-refreshed", expiry_date: Date.now() + 3600_000 });

    // Persistence is async inside the handler — await a tick
    await new Promise((r) => setTimeout(r, 10));

    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(s?.googleAccessTok).toBeTruthy();
    expect(s?.googleAccessTok).not.toContain("a-refreshed"); // stored encrypted
    expect(decrypt(s!.googleAccessTok!)).toBe("a-refreshed");
  });

  afterAll(async () => { await prisma.$disconnect(); });
});
