import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

vi.mock("@/lib/google/oauth", () => ({
  getAuthUrl: () => "https://accounts.google.com/o/oauth2/auth?fake=1",
  exchangeCode: vi.fn(async () => {}),
}));

import { GET as connect } from "@/app/api/auth/google/route";
import { GET as callback } from "@/app/api/auth/google/callback/route";
import { exchangeCode } from "@/lib/google/oauth";

beforeAll(() => { process.env.APP_BASE_URL = "http://localhost:3000"; });

describe("oauth routes", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("redirects to consent", async () => {
    const res = await connect();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("accounts.google.com");
  });

  it("handles the callback and redirects home", async () => {
    const req = new Request("http://localhost:3000/api/auth/google/callback?code=abc");
    const res = await callback(req);
    expect(exchangeCode).toHaveBeenCalledWith("abc");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("connected=1");
  });

  it("redirects to error URL when code is missing", async () => {
    const req = new Request("http://localhost:3000/api/auth/google/callback");
    const res = await callback(req);
    expect(exchangeCode).not.toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=missing_code");
  });
});
