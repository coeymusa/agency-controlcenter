import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireBearer } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = requireBearer(req);
  if (auth) return auth;
  const { slug } = await params;
  const [prospect] = await db
    .select()
    .from(schema.prospects)
    .where(eq(schema.prospects.slug, slug))
    .limit(1);
  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const emails = await db
    .select()
    .from(schema.emails)
    .where(eq(schema.emails.prospectId, prospect.id))
    .orderBy(desc(schema.emails.createdAt));
  const events = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.prospectId, prospect.id))
    .orderBy(desc(schema.events.occurredAt))
    .limit(200);
  return NextResponse.json({ prospect, emails, events });
}

const patchSchema = z.object({
  business: z.string().optional(),
  contactName: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  website: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  status: z
    .enum([
      "lead",
      "researched",
      "mock_built",
      "emailed",
      "opened",
      "clicked",
      "replied",
      "meeting",
      "won",
      "lost",
      "ignored",
    ])
    .optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  pitchUrl: z.string().url().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = requireBearer(req);
  if (auth) return auth;
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid", issues: parsed.error.issues }, { status: 400 });
  }
  const [existing] = await db
    .select()
    .from(schema.prospects)
    .where(eq(schema.prospects.slug, slug))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  const [row] = await db
    .update(schema.prospects)
    .set(patch)
    .where(eq(schema.prospects.id, existing.id))
    .returning();

  if (parsed.data.status && parsed.data.status !== existing.status) {
    await db.insert(schema.events).values({
      type: "status_change",
      prospectId: row.id,
      metadata: { from: existing.status, to: row.status, via: "patch" },
    });
  }
  return NextResponse.json({ prospect: row });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = requireBearer(req);
  if (auth) return auth;
  const { slug } = await params;
  const [existing] = await db
    .select()
    .from(schema.prospects)
    .where(eq(schema.prospects.slug, slug))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.delete(schema.prospects).where(eq(schema.prospects.id, existing.id));
  return NextResponse.json({ deleted: true, slug });
}
