import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireBearer } from "@/lib/auth";
import { listSettings, setSetting, SETTING_KEYS, SettingKey } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireBearer(req);
  if (auth) return auth;
  const rows = await listSettings();
  return NextResponse.json({ settings: rows });
}

const patchSchema = z.record(z.string(), z.string().nullable());

export async function POST(req: NextRequest) {
  const auth = requireBearer(req);
  if (auth) return auth;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid", issues: parsed.error.issues }, { status: 400 });
  }
  let updated = 0;
  for (const [key, val] of Object.entries(parsed.data)) {
    if (!(SETTING_KEYS as readonly string[]).includes(key)) continue;
    await setSetting(key as SettingKey, val ?? null);
    updated++;
  }
  return NextResponse.json({ updated });
}
