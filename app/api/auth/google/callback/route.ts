import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google/oauth";

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  if (!code) return NextResponse.redirect(`${base}/?error=missing_code`, 302);
  await exchangeCode(code);
  return NextResponse.redirect(`${base}/?connected=1`, 302);
}
