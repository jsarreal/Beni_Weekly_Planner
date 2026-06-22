import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { getSettings } from "@/lib/settings";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.send"
];

function client(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  ) as unknown as OAuth2Client;
}

export function getAuthUrl(): string {
  return client().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function exchangeCode(code: string): Promise<void> {
  const c = client();
  const { tokens } = await c.getToken(code);
  await getSettings();
  await prisma.settings.update({
    where: { id: 1 },
    data: {
      googleRefresh: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      googleAccessTok: tokens.access_token ? encrypt(tokens.access_token) : undefined,
      googleTokenExp: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    },
  });
}

export async function getAuthedClient(): Promise<OAuth2Client> {
  const s = await getSettings();
  if (!s.googleRefresh) throw new Error("Google not connected");
  const c = client();
  c.setCredentials({
    refresh_token: decrypt(s.googleRefresh),
    access_token: s.googleAccessTok ? decrypt(s.googleAccessTok) : undefined,
    expiry_date: s.googleTokenExp ? s.googleTokenExp.getTime() : undefined,
  });
  // Persist refreshed access tokens transparently (real OAuth2Client is an EventEmitter).
  if (typeof c.on === "function") {
    c.on("tokens", async (t) => {
      await prisma.settings.update({
        where: { id: 1 },
        data: {
          googleAccessTok: t.access_token ? encrypt(t.access_token) : undefined,
          googleTokenExp: t.expiry_date ? new Date(t.expiry_date) : undefined,
        },
      });
    });
  }
  return c;
}
