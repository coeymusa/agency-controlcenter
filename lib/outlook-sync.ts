import { db, schema } from "./db";
import { and, eq, isNotNull } from "drizzle-orm";
import { getSetting } from "./settings";

async function accessToken(): Promise<{ token: string; me: string }> {
  const clientId = await getSetting("OUTLOOK_CLIENT_ID");
  const refresh = await getSetting("OUTLOOK_REFRESH_TOKEN");
  const tenant = (await getSetting("OUTLOOK_TENANT")) ?? "common";
  const me = (await getSetting("OUTLOOK_USER")) ?? "";
  if (!clientId || !refresh) throw new Error("Outlook not connected — open /settings");
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refresh,
      scope: "offline_access Mail.Read Mail.Send",
    }),
  });
  if (!res.ok) throw new Error("token refresh failed: " + (await res.text()));
  const body = (await res.json()) as { access_token: string };
  return { token: body.access_token, me };
}

type GraphMessage = {
  id: string;
  conversationId: string;
  internetMessageId?: string;
  subject?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: { emailAddress?: { address?: string; name?: string } }[];
  body?: { contentType?: string; content?: string };
  bodyPreview?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
};

async function listConversation(token: string, conversationId: string): Promise<GraphMessage[]> {
  // Microsoft Graph $filter on conversationId — fetch all messages in this thread.
  const url =
    "https://graph.microsoft.com/v1.0/me/messages" +
    `?$filter=conversationId eq '${encodeURIComponent(conversationId).replace(/'/g, "''")}'` +
    "&$select=id,conversationId,internetMessageId,subject,from,toRecipients,body,bodyPreview,receivedDateTime,sentDateTime" +
    "&$top=50";
  const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) throw new Error("graph list failed: " + (await res.text()));
  const body = (await res.json()) as { value: GraphMessage[] };
  return body.value ?? [];
}

export async function runOutlookSync() {
  const { token, me: meRaw } = await accessToken();
  const sent = await db
    .select()
    .from(schema.emails)
    .where(and(eq(schema.emails.direction, "outbound"), isNotNull(schema.emails.outlookConversationId)));

  const convIds = Array.from(new Set(sent.map((e) => e.outlookConversationId!).filter(Boolean)));
  let newReplies = 0;
  let scanned = 0;
  const me = meRaw.toLowerCase();

  for (const cid of convIds) {
    const out = sent.find((e) => e.outlookConversationId === cid)!;
    const msgs = await listConversation(token, cid);
    for (const m of msgs) {
      scanned++;
      const existing = await db
        .select()
        .from(schema.emails)
        .where(eq(schema.emails.outlookMessageId, m.id))
        .limit(1);
      if (existing.length > 0) continue;

      const fromAddr = m.from?.emailAddress?.address ?? "";
      const toAddr = (m.toRecipients ?? []).map((r) => r.emailAddress?.address).filter(Boolean).join(", ");
      const isFromMe = me && fromAddr.toLowerCase() === me;
      const direction = isFromMe ? "outbound" : "inbound";
      const contentType = m.body?.contentType ?? "text";
      const bodyHtml = contentType.toLowerCase() === "html" ? m.body?.content ?? null : null;
      const bodyText = contentType.toLowerCase() === "html" ? null : m.body?.content ?? m.bodyPreview ?? null;
      const when = m.receivedDateTime ?? m.sentDateTime ?? null;

      const [row] = await db
        .insert(schema.emails)
        .values({
          prospectId: out.prospectId,
          direction,
          subject: m.subject ?? "(no subject)",
          bodyText,
          bodyHtml,
          fromAddr,
          toAddr,
          outlookMessageId: m.id,
          outlookConversationId: cid,
          internetMessageId: m.internetMessageId ?? null,
          sentAt: when ? new Date(when) : null,
        })
        .returning();

      await db.insert(schema.events).values({
        type: direction === "inbound" ? "email_reply" : "email_sent",
        emailId: row.id,
        prospectId: out.prospectId,
        metadata: { subject: m.subject, outlookMessageId: m.id, source: "outlook-sync" },
      });
      if (direction === "inbound") {
        await db
          .update(schema.prospects)
          .set({ status: "replied", updatedAt: new Date() })
          .where(eq(schema.prospects.id, out.prospectId));
        newReplies++;
      }
    }
  }
  return { conversations: convIds.length, scanned, newReplies };
}
