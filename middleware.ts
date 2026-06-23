import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // SESSION_SECRET not configured — block access rather than allow everything
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const token = req.cookies.get("session")?.value;
  if (!token || !(await verifySessionToken(token, secret))) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

async function verifySessionToken(token: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBytes = hexToBytes(token);
    if (sigBytes.length === 0) return false;
    return await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode("auth"));
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (isNaN(byte)) return new Uint8Array(0);
    bytes[i] = byte;
  }
  return bytes;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
