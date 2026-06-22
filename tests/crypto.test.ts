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

  it("rejects a tampered auth tag", () => {
    const blob = encrypt("sensitive-data");
    const parts = blob.split(":");
    // parts[0] = iv, parts[1] = tag, parts[2] = ciphertext
    const originalTag = Buffer.from(parts[1], "base64");
    // Flip every byte so it's definitely different
    const tamperedTag = Buffer.from(originalTag.map((b) => b ^ 0xff));
    parts[1] = tamperedTag.toString("base64");
    const tampered = parts.join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("rejects a wrong key", () => {
    const blob = encrypt("another-secret");
    // Switch to a different 32-byte key
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 99).toString("base64");
    expect(() => decrypt(blob)).toThrow();
    // Restore original key so other tests are unaffected
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });
});
