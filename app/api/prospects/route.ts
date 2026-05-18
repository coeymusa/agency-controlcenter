import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireBearer, slugify } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const upsertSchema = z.object({
  slug: z.string().min(1).optional(),
  business: z.string().min(1),
  contactName: z.string().optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  website: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
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
  notes: z.string().optional().nullable(),
  pitchUrl: z.string().url().optional().nullable(),
  pitchDeployedAt: z.string().datetime().optional().nullable(),
  pitchIssues: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const auth = requireBearer(req);
  if (auth) return auth;
  const rows = await db.select().from(schema.prospects).orderBy(desc(schema.prospects.updatedAt));
  return NextResponse.json({ prospects: rows });
}

export async function POST(req: NextRequest) {
  const auth = requireBearer(req);
  if (auth) return auth;
  const body = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid", issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;
  const slug = slugify(d.slug ?? d.business);
  const existing = await db.select().from(schema.prospects).where(eq(schema.prospects.slug, slug)).limit(1);

  const values = {
    slug,
    business: d.business,
    contactName: d.contactName ?? null,
    contactEmail: d.contactEmail ?? null,
    website: d.website ?? null,
    location: d.location ?? null,
    industry: d.industry ?? null,
    status: d.status ?? "lead",
    tags: d.tags ?? [],
    notes: d.notes ?? null,
    pitchUrl: d.pitchUrl ?? null,
    pitchIssues: d.pitchIssues ?? null,
    pitchDeployedAt: d.pitchDeployedAt ? new Date(d.pitchDeployedAt) : null,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    const [row] = await db
      .update(schema.prospects)
      .set(values)
      .where(eq(schema.prospects.id, existing[0].id))
      .returning();
    await db.insert(schema.events).values({
      type: "status_change",
      prospectId: row.id,
      metadata: { newStatus: row.status, via: "api" },
    });
    return NextResponse.json({ prospect: row, created: false });
  }
  const [row] = await db.insert(schema.prospects).values(values).returning();
  await db.insert(schema.events).values({
    type: "status_change",
    prospectId: row.id,
    metadata: { newStatus: row.status, via: "api", created: true },
  });
  return NextResponse.json({ prospect: row, created: true });
}
