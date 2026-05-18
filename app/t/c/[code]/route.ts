import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let target = "/";
  try {
    const [link] = await db.select().from(schema.links).where(eq(schema.links.code, code)).limit(1);
    if (!link) {
      return NextResponse.json({ error: "Unknown link" }, { status: 404 });
    }
    target = link.target;
    await db
      .update(schema.links)
      .set({ clickCount: sql`${schema.links.clickCount} + 1` })
      .where(eq(schema.links.id, link.id));
    await db.insert(schema.events).values({
      type: "link_click",
      emailId: link.emailId ?? undefined,
      prospectId: link.prospectId ?? undefined,
      linkId: link.id,
      ipAddr: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
      metadata: { target },
    });
    if (link.prospectId) {
      await db
        .update(schema.prospects)
        .set({ status: "clicked", updatedAt: new Date() })
        .where(eq(schema.prospects.id, link.prospectId));
    }
  } catch (err) {
    console.error("[track-click]", err);
  }
  return NextResponse.redirect(target, { status: 302 });
}
