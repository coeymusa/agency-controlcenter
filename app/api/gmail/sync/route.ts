import { NextRequest, NextResponse } from "next/server";
import { requireBearer } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Triggers the Gmail sync. Same logic as `pnpm gmail:sync` but invokable
 * over HTTP (so a Vercel Cron can hit it).
 *
 * Configure cron in vercel.json or the Vercel dashboard:
 *   path: /api/gmail/sync   schedule: every 30 mins
 *
 * Cron requests should include header `Authorization: Bearer ${CONTROL_API_TOKEN}`.
 */
export async function GET(req: NextRequest) {
  const auth = requireBearer(req);
  if (auth) return auth;
  try {
    const { runSync } = await import("@/lib/gmail-sync");
    const result = await runSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
