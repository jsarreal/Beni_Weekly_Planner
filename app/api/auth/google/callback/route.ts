import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google/oauth";
import { syncCalendar } from "@/lib/sync";

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  if (!code) return NextResponse.redirect(`${base}/?error=missing_code`, 302);
  await exchangeCode(code);

  // Trigger initial calendar sync to schedule goals & habits immediately
  try {
    await syncCalendar();
  } catch (err) {
    console.error("[OAuth Callback] Initial calendar sync failed:", err);
  }

  return NextResponse.redirect(`${base}/?connected=1`, 302);
}
