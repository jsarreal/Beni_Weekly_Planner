import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google/oauth";

export async function GET() {
  return NextResponse.redirect(getAuthUrl(), 302);
}
