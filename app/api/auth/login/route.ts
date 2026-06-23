import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

function computeSessionToken(secret: string): string {
  return createHmac("sha256", secret).update("auth").digest("hex");
}

export async function POST(req: Request) {
  const appPassword = process.env.APP_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!appPassword || !sessionSecret) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const provided = body.password ?? "";

  // Constant-time comparison — pad to same length to avoid length leaks
  const expectedBuf = Buffer.from(appPassword);
  const providedBuf = Buffer.alloc(expectedBuf.length);
  Buffer.from(provided).copy(providedBuf);

  const match = timingSafeEqual(expectedBuf, providedBuf) && provided.length === appPassword.length;

  if (!match) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = computeSessionToken(sessionSecret);
  const isProduction = process.env.NODE_ENV === "production";

  const res = NextResponse.json({ ok: true });
  res.cookies.set("session", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
