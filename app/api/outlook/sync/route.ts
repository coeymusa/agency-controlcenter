import { NextRequest, NextResponse } from "next/server";
import { requireBearer } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = requireBearer(req);
  if (auth) return auth;
  try {
    const { runOutlookSync } = await import("@/lib/outlook-sync");
    const result = await runOutlookSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
