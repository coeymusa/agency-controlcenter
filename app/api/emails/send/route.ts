import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireBearer, shortCode } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { resendSend, rewriteLinks, htmlWithPixel, textToHtml } from "@/lib/resend";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sendSchema = z.object({
  prospectSlug: z.string().optional(),
  prospectId: z.number().optional(),
  to: z.string().email().optional(),
  from: z.string().optional(),
  replyTo: z.string().optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
  bodyHtml: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = requireBearer(req);
  if (auth) return auth;
  const parsed = sendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid", issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;

  let prospectId = d.prospectId;
  let prospect: typeof schema.prospects.$inferSelect | undefined;
  if (!prospectId && d.prospectSlug) {
    const [p] = await db.select().from(schema.prospects).where(eq(schema.prospects.slug, d.prospectSlug)).limit(1);
    if (!p) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
    prospect = p;
    prospectId = p.id;
  }
  if (!prospectId) return NextResponse.json({ error: "prospectId or prospectSlug required" }, { status: 400 });

  const toAddr = d.to ?? prospect?.contactEmail;
  if (!toAddr) return NextResponse.json({ error: "no recipient email on file" }, { status: 400 });

  const base = (await getSetting("PUBLIC_BASE_URL")) ?? process.env.NEXT_PUBLIC_TRACK_BASE ?? "";
  if (!base) return NextResponse.json({ error: "PUBLIC_BASE_URL not set — open /settings" }, { status: 400 });

  // 1. Insert the email row first so we have an ID for the tracking pixel
  const [emailRow] = await db
    .insert(schema.emails)
    .values({
      prospectId,
      direction: "outbound",
      subject: d.subject,
      bodyText: d.body,
      bodyHtml: null, // filled in after rewrite
      fromAddr: d.from ?? (await getSetting("RESEND_FROM")) ?? null,
      toAddr,
      sentAt: new Date(),
    })
    .returning();

  // 2. Rewrite links in the body to /t/c/<code>
  const codes: { code: string; target: string }[] = [];
  const usedCodes = new Set<string>();
  const generate = () => {
    let c;
    do { c = shortCode(8); } while (usedCodes.has(c));
    usedCodes.add(c);
    return c;
  };
  const { body: rewrittenText, links } = rewriteLinks(d.body, generate, base);
  for (const l of links) codes.push(l);

  // 3. Build HTML — either user provided, or we convert text → html
  let html = d.bodyHtml ? d.bodyHtml : textToHtml(rewrittenText);
  // Rewrite URLs in user-provided HTML too
  if (d.bodyHtml) {
    const { body: rewrittenHtml, links: htmlLinks } = rewriteLinks(d.bodyHtml, generate, base);
    html = rewrittenHtml;
    for (const l of htmlLinks) {
      if (!codes.some((c) => c.code === l.code)) codes.push(l);
    }
  }
  html = htmlWithPixel(html, emailRow.id, base);

  // 4. Persist the link rows so /t/c/<code> can resolve them
  for (const l of codes) {
    await db.insert(schema.links).values({
      code: l.code,
      emailId: emailRow.id,
      prospectId,
      target: l.target,
    });
  }

  // 5. Send via Resend
  try {
    const sent = await resendSend({
      to: toAddr,
      from: d.from,
      replyTo: d.replyTo,
      subject: d.subject,
      html,
      text: rewrittenText,
    });
    await db.update(schema.emails)
      .set({ bodyHtml: html, resendMessageId: sent.id })
      .where(eq(schema.emails.id, emailRow.id));
    await db.insert(schema.events).values({
      type: "email_sent",
      emailId: emailRow.id,
      prospectId,
      metadata: { subject: d.subject, provider: "resend", resendMessageId: sent.id },
    });
    await db.update(schema.prospects)
      .set({ status: "emailed", updatedAt: new Date() })
      .where(eq(schema.prospects.id, prospectId));
    return NextResponse.json({ ok: true, email: { id: emailRow.id }, resendId: sent.id, links: codes });
  } catch (e) {
    // Roll back: delete the email row + link rows we inserted
    await db.delete(schema.links).where(eq(schema.links.emailId, emailRow.id));
    await db.delete(schema.emails).where(eq(schema.emails.id, emailRow.id));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
