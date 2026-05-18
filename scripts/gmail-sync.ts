#!/usr/bin/env tsx
/**
 * Polls Gmail for messages in threads that match outbound emails we've logged,
 * and records inbound replies + new events.
 *
 * Run periodically: `pnpm gmail:sync`  (or hook to a Vercel cron via /api/gmail/sync).
 */
import "dotenv/config";
import { google, gmail_v1 } from "googleapis";
import { db, schema } from "../lib/db.js";
import { and, eq, isNotNull } from "drizzle-orm";

function gmailClient() {
  const cid = process.env.GMAIL_CLIENT_ID;
  const cs = process.env.GMAIL_CLIENT_SECRET;
  const rt = process.env.GMAIL_REFRESH_TOKEN;
  if (!cid || !cs || !rt) throw new Error("Gmail env vars not set. Run `pnpm gmail:auth` first.");
  const oauth2 = new google.auth.OAuth2(cid, cs);
  oauth2.setCredentials({ refresh_token: rt });
  return google.gmail({ version: "v1", auth: oauth2 });
}

function decodeBody(payload?: gmail_v1.Schema$MessagePart): { text: string | null; html: string | null } {
  let text: string | null = null;
  let html: string | null = null;
  function walk(p?: gmail_v1.Schema$MessagePart) {
    if (!p) return;
    const data = p.body?.data;
    if (data) {
      const buf = Buffer.from(data, "base64").toString("utf8");
      if (p.mimeType === "text/plain" && !text) text = buf;
      if (p.mimeType === "text/html" && !html) html = buf;
    }
    p.parts?.forEach(walk);
  }
  walk(payload);
  return { text, html };
}

function header(msg: gmail_v1.Schema$Message, name: string): string | null {
  const h = msg.payload?.headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

async function main() {
  const gmail = gmailClient();
  const sent = await db
    .select()
    .from(schema.emails)
    .where(and(eq(schema.emails.direction, "outbound"), isNotNull(schema.emails.gmailThreadId)));

  const threadIds = Array.from(new Set(sent.map((e) => e.gmailThreadId!).filter(Boolean)));
  console.log(`Checking ${threadIds.length} threads…`);

  let newReplies = 0;
  for (const tid of threadIds) {
    const out = sent.find((e) => e.gmailThreadId === tid)!;
    const thread = await gmail.users.threads.get({ userId: "me", id: tid });
    const msgs = thread.data.messages ?? [];
    for (const msg of msgs) {
      if (!msg.id) continue;
      const existing = await db
        .select()
        .from(schema.emails)
        .where(eq(schema.emails.gmailMessageId, msg.id))
        .limit(1);
      if (existing.length > 0) continue;

      const from = header(msg, "From") ?? "";
      const to = header(msg, "To") ?? "";
      const subject = header(msg, "Subject") ?? "(no subject)";
      const me = (process.env.GMAIL_USER ?? "").toLowerCase();
      const isFromMe = me && from.toLowerCase().includes(me);
      const direction = isFromMe ? "outbound" : "inbound";
      const { text, html } = decodeBody(msg.payload);

      const [row] = await db
        .insert(schema.emails)
        .values({
          prospectId: out.prospectId,
          direction,
          subject,
          bodyText: text,
          bodyHtml: html,
          fromAddr: from,
          toAddr: to,
          gmailMessageId: msg.id,
          gmailThreadId: tid,
          sentAt: msg.internalDate ? new Date(parseInt(msg.internalDate)) : null,
        })
        .returning();

      await db.insert(schema.events).values({
        type: direction === "inbound" ? "email_reply" : "email_sent",
        emailId: row.id,
        prospectId: out.prospectId,
        metadata: { subject, gmailMessageId: msg.id },
      });
      if (direction === "inbound") {
        await db
          .update(schema.prospects)
          .set({ status: "replied", updatedAt: new Date() })
          .where(eq(schema.prospects.id, out.prospectId));
        newReplies++;
      }
      console.log(`  + ${direction} «${subject}» in thread ${tid}`);
    }
  }
  console.log(`\n✓ Done. ${newReplies} new replies.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
