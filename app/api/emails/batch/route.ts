import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireBearer, shortCode } from "@/lib/auth";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const itemSchema = z.object({
  prospectSlug: z.string().optional(),
  prospectId: z.number().optional(),
  direction: z.enum(["outbound", "inbound"]).default("outbound"),
  subject: z.string().min(1),
  bodyText: z.string().optional().nullable(),
  bodyHtml: z.string().optional().nullable(),
  fromAddr: z.string().optional().nullable(),
  toAddr: z.string().optional().nullable(),
  gmailMessageId: z.string().optional().nullable(),
  gmailThreadId: z.string().optional().nullable(),
  outlookMessageId: z.string().optional().nullable(),
  outlookConversationId: z.string().optional().nullable(),
  internetMessageId: z.string().optional().nullable(),
  sentAt: z.string().datetime().optional().nullable(),
  trackLinks: z.array(z.object({ target: z.string().url(), label: z.string().optional() })).optional(),
});

const batchSchema = z.object({ emails: z.array(itemSchema).min(1) });

export async function POST(req: NextRequest) {
  const auth = requireBearer(req);
  if (auth) return auth;
  const body = await req.json().catch(() => null);
  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid", issues: parsed.error.issues }, { status: 400 });
  }
  const base = process.env.NEXT_PUBLIC_TRACK_BASE ?? "";
  const results: unknown[] = [];

  for (const d of parsed.data.emails) {
    let prospectId = d.prospectId;
    if (!prospectId && d.prospectSlug) {
      const [p] = await db
        .select()
        .from(schema.prospects)
        .where(eq(schema.prospects.slug, d.prospectSlug))
        .limit(1);
      if (p) prospectId = p.id;
    }
    if (!prospectId) {
      results.push({ ok: false, error: "no prospect", input: d });
      continue;
    }
    const [row] = await db
      .insert(schema.emails)
      .values({
        prospectId,
        direction: d.direction,
        subject: d.subject,
        bodyText: d.bodyText ?? null,
        bodyHtml: d.bodyHtml ?? null,
        fromAddr: d.fromAddr ?? null,
        toAddr: d.toAddr ?? null,
        gmailMessageId: d.gmailMessageId ?? null,
        gmailThreadId: d.gmailThreadId ?? null,
        outlookMessageId: d.outlookMessageId ?? null,
        outlookConversationId: d.outlookConversationId ?? null,
        internetMessageId: d.internetMessageId ?? null,
        sentAt: d.sentAt ? new Date(d.sentAt) : d.direction === "outbound" ? new Date() : null,
      })
      .returning();

    const createdLinks: { code: string; target: string; label?: string }[] = [];
    if (d.trackLinks?.length) {
      for (const tl of d.trackLinks) {
        const code = shortCode(8);
        await db.insert(schema.links).values({
          code,
          emailId: row.id,
          prospectId,
          target: tl.target,
          label: tl.label ?? null,
        });
        createdLinks.push({ code, target: tl.target, label: tl.label });
      }
    }

    await db.insert(schema.events).values({
      type: d.direction === "outbound" ? "email_sent" : "email_reply",
      emailId: row.id,
      prospectId,
      metadata: { subject: d.subject },
    });

    if (d.direction === "outbound") {
      await db
        .update(schema.prospects)
        .set({ status: "emailed", updatedAt: new Date() })
        .where(eq(schema.prospects.id, prospectId));
    }

    results.push({
      ok: true,
      email: row,
      trackingPixel: `${base}/t/o/${row.id}.png`,
      links: createdLinks.map((l) => ({ ...l, trackUrl: `${base}/t/c/${l.code}` })),
    });
  }
  return NextResponse.json({ results });
}
