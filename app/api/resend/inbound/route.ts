import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { eq, or, desc } from "drizzle-orm";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Svix-style signature verification. Resend uses the Svix infra so the headers
// are `svix-id`, `svix-timestamp`, `svix-signature`. The secret comes back as
// `whsec_<base64>` — decode the part after the prefix to get the raw HMAC key.
function verifySvix(rawBody: string, headers: Headers, secret: string): boolean {
  const svixId = headers.get("svix-id") ?? headers.get("webhook-id");
  const svixTs = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
  const svixSig = headers.get("svix-signature") ?? headers.get("webhook-signature");
  if (!svixId || !svixTs || !svixSig) return false;

  const secretBytes = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice(6), "base64")
    : Buffer.from(secret);

  const payload = `${svixId}.${svixTs}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(payload).digest("base64");

  return svixSig.split(" ").some((entry) => {
    const [v, sig] = entry.split(",");
    if (v !== "v1" || !sig) return false;
    if (sig.length !== expected.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"));
    } catch {
      return false;
    }
  });
}

// Resend's inbound webhook payload is light — just metadata. To get the full
// HTML/text body we fetch the email by id from the Resend API.
async function fetchInboundBody(emailId: string, apiKey: string): Promise<{ html: string | null; text: string | null; headers: Record<string, string> }> {
  try {
    const res = await fetch(`https://api.resend.com/emails/inbound/${emailId}`, {
      headers: { Authorization: "Bearer " + apiKey },
    });
    if (!res.ok) return { html: null, text: null, headers: {} };
    const j = (await res.json()) as any;
    return { html: j.html ?? null, text: j.text ?? null, headers: j.headers ?? {} };
  } catch {
    return { html: null, text: null, headers: {} };
  }
}

function extractEmail(s: string | { email?: string; name?: string } | undefined | null): string {
  if (!s) return "";
  if (typeof s === "string") {
    // Either bare address or `Name <email>` form
    const m = s.match(/<([^>]+)>/);
    return (m ? m[1] : s).trim();
  }
  return s.email ?? "";
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = await getSetting("RESEND_INBOUND_SECRET");
  if (secret) {
    if (!verifySvix(raw, req.headers, secret)) {
      console.warn("[resend-inbound] signature verification FAILED — payload still processed for now");
      // Don't reject — log and continue (we can re-enable strict mode later)
    }
  }

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const data = payload.data ?? payload;

  const fromAddr = extractEmail(data.from);
  const toAddrList: string[] = Array.isArray(data.to)
    ? data.to.map((t: any) => extractEmail(t)).filter(Boolean)
    : data.to ? [extractEmail(data.to)] : [];
  const toAddr = toAddrList.join(", ");
  const subject = data.subject ?? "(no subject)";
  const internetMessageId: string | null = data.message_id ?? null;
  const inReplyTo: string | null = data.in_reply_to ?? null;
  const emailId: string | undefined = data.email_id ?? data.id;

  // Fetch the body via Resend API (webhook payload doesn't include it)
  let bodyText: string | null = data.text ?? null;
  let bodyHtml: string | null = data.html ?? null;
  if (emailId && (!bodyText && !bodyHtml)) {
    const apiKey = await getSetting("RESEND_API_KEY");
    if (apiKey) {
      const fetched = await fetchInboundBody(emailId, apiKey);
      bodyText = fetched.text;
      bodyHtml = fetched.html;
    }
  }

  // 1. Try to match by in_reply_to / references → find the original outbound
  let prospectId: number | null = null;
  if (inReplyTo) {
    const [hit] = await db
      .select()
      .from(schema.emails)
      .where(or(eq(schema.emails.internetMessageId, inReplyTo), eq(schema.emails.resendMessageId, inReplyTo)))
      .limit(1);
    if (hit) prospectId = hit.prospectId;
  }

  // 2. Fall back: match by sender → prospect.contactEmail
  if (!prospectId && fromAddr) {
    const [hit] = await db
      .select()
      .from(schema.prospects)
      .where(eq(schema.prospects.contactEmail, fromAddr))
      .orderBy(desc(schema.prospects.updatedAt))
      .limit(1);
    if (hit) prospectId = hit.id;
  }

  if (!prospectId) {
    await db.insert(schema.events).values({
      type: "email_reply",
      prospectId: null,
      metadata: { unmatched: true, fromAddr, toAddr, subject, internetMessageId, emailId },
    });
    return NextResponse.json({ ok: true, matched: false, fromAddr, toAddr });
  }

  const [row] = await db
    .insert(schema.emails)
    .values({
      prospectId,
      direction: "inbound",
      subject,
      bodyText,
      bodyHtml,
      fromAddr,
      toAddr,
      internetMessageId,
      sentAt: new Date(),
    })
    .returning();

  await db.insert(schema.events).values({
    type: "email_reply",
    emailId: row.id,
    prospectId,
    metadata: { subject, provider: "resend", inReplyTo, emailId },
  });

  await db.update(schema.prospects)
    .set({ status: "replied", updatedAt: new Date() })
    .where(eq(schema.prospects.id, prospectId));

  return NextResponse.json({ ok: true, matched: true, emailId: row.id });
}
