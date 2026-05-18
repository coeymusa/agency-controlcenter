import { NextRequest, NextResponse } from "next/server";
import { requireBearer } from "@/lib/auth";
import { dispatchScheduled } from "@/lib/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron triggers this every minute. The cron caller is authenticated
// using the same CONTROL_API_TOKEN bearer scheme; set CRON_SECRET = your
// CONTROL_API_TOKEN value on the project so Vercel includes the right header.
export async function GET(req: NextRequest) {
  const auth = requireBearer(req);
  if (auth) return auth;
  try {
    const r = await dispatchScheduled();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
