import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireBearer } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noteSchema = z.object({
  prospectSlug: z.string().optional(),
  prospectId: z.number().optional(),
  type: z
    .enum(["email_sent", "email_open", "link_click", "email_reply", "note", "status_change"])
    .default("note"),
  metadata: z.record(z.unknown()).optional(),
});

export async function GET(req: NextRequest) {
  const auth = requireBearer(req);
  if (auth) return auth;
  const rows = await db
    .select()
    .from(schema.events)
    .orderBy(desc(schema.events.occurredAt))
    .limit(500);
  return NextResponse.json({ events: rows });
}

export async function POST(req: NextRequest) {
  const auth = requireBearer(req);
  if (auth) return auth;
  const body = await req.json().catch(() => null);
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid", issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;
  let prospectId = d.prospectId;
  if (!prospectId && d.prospectSlug) {
    const [p] = await db
      .select()
      .from(schema.prospects)
      .where(eq(schema.prospects.slug, d.prospectSlug))
      .limit(1);
    if (p) prospectId = p.id;
  }
  const [row] = await db
    .insert(schema.events)
    .values({
      type: d.type,
      prospectId: prospectId ?? null,
      metadata: (d.metadata ?? {}) as Record<string, unknown>,
    })
    .returning();
  return NextResponse.json({ event: row });
}
