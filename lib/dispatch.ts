import { db, schema } from "./db";
import { and, eq, isNull, lte, isNotNull } from "drizzle-orm";
import { getSetting } from "./settings";
import { resendSend, rewriteLinks, htmlWithPixel, textToHtml } from "./resend";
import { shortCode } from "./auth";

// Sends any outbound emails whose `scheduled_for` has elapsed and that haven't
// been handed off to Resend yet. Idempotent — safe to call on every cron tick.
export async function dispatchScheduled(): Promise<{ sent: number; failed: { emailId: number; error: string }[]; scanned: number }> {
  const now = new Date();
  const due = await db
    .select()
    .from(schema.emails)
    .where(and(
      eq(schema.emails.direction, "outbound"),
      isNotNull(schema.emails.scheduledFor),
      isNull(schema.emails.resendMessageId),
      lte(schema.emails.scheduledFor, now),
    ));

  if (due.length === 0) return { sent: 0, failed: [], scanned: 0 };

  const failed: { emailId: number; error: string }[] = [];
  let sent = 0;
  const base = (await getSetting("PUBLIC_BASE_URL")) ?? process.env.NEXT_PUBLIC_TRACK_BASE ?? "";

  for (const e of due) {
    if (!base) { failed.push({ emailId: e.id, error: "PUBLIC_BASE_URL not set" }); continue; }
    try {
      // Rewrite the stored body links (in case it's still got bare URLs in it)
      // and (re-)inject the tracking pixel.
      const used = new Set<string>();
      const gen = () => { let c; do { c = shortCode(8); } while (used.has(c)); used.add(c); return c; };
      const { body: rewrittenText, links } = rewriteLinks(e.bodyText ?? "", gen, base);

      // Ensure link rows exist for any tracked codes we just generated
      for (const l of links) {
        await db.insert(schema.links).values({ code: l.code, emailId: e.id, prospectId: e.prospectId, target: l.target });
      }

      const html = htmlWithPixel(textToHtml(rewrittenText), e.id, base);
      const result = await resendSend({
        to: e.toAddr ?? "",
        from: e.fromAddr ?? undefined,
        subject: e.subject,
        html,
        text: rewrittenText,
        inReplyTo: e.inReplyTo ?? undefined,
      });
      await db.update(schema.emails)
        .set({ resendMessageId: result.id, sentAt: new Date(), bodyHtml: html })
        .where(eq(schema.emails.id, e.id));
      await db.insert(schema.events).values({
        type: "email_sent",
        emailId: e.id,
        prospectId: e.prospectId,
        metadata: { subject: e.subject, provider: "resend", resendMessageId: result.id, scheduled: true },
      });
      await db.update(schema.prospects)
        .set({ status: "emailed", updatedAt: new Date() })
        .where(eq(schema.prospects.id, e.prospectId));
      sent++;
    } catch (err) {
      failed.push({ emailId: e.id, error: String(err) });
    }
  }

  return { sent, failed, scanned: due.length };
}
