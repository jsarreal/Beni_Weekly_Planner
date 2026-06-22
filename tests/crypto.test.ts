import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "@/lib/crypto";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("crypto", () => {
  it("round-trips a secret", () => {
    const secret = "refresh-token-123";
    const blob = encrypt(secret);
    expect(blob).not.toContain(secret);
    expect(decrypt(blob)).toBe(secret);
  });
});
