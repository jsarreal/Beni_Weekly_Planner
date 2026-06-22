import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const b64 = process.env.APP_ENCRYPTION_KEY;
  if (!b64) throw new Error("APP_ENCRYPTION_KEY is not set");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes (base64)");
  return k;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decrypt(blob: string): string {
  if (!blob) {
    throw new Error("Decrypt received empty or null string");
  }
  const parts = blob.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted blob format: must contain three parts separated by colons");
  }
  const [ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
