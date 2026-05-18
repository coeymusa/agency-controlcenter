import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { eq, desc, and, gte } from "drizzle-orm";

export const dynamic = "force-dynamic";

function fmt(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function relTime(d: Date | null | undefined): string {
  if (!d) return "—";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 86400 * 30) return Math.floor(s / 86400) + "d ago";
  return new Date(d).toLocaleDateString();
}

const TYPE_PILL: Record<string, string> = {
  email_sent: "blue",
  email_open: "blue",
  link_click: "purple",
  email_reply: "green",
  note: "slate",
  status_change: "slate",
};

export default async function SentEmailDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [email] = await db
    .select()
    .from(schema.emails)
    .where(eq(schema.emails.id, id))
    .limit(1);
  if (!email) notFound();

  const [prospect] = email.prospectId
    ? await db.select().from(schema.prospects).where(eq(schema.prospects.id, email.prospectId)).limit(1)
    : [null];

  const events = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.emailId, id))
    .orderBy(desc(schema.events.occurredAt));

  const links = await db
    .select()
    .from(schema.links)
    .where(eq(schema.links.emailId, id))
    .orderBy(desc(schema.links.clickCount));

  // Inbound replies on the same prospect, sent after this email
  const replies = email.prospectId
    ? await db
        .select()
        .from(schema.emails)
        .where(
          and(
            eq(schema.emails.direction, "inbound"),
            eq(schema.emails.prospectId, email.prospectId),
            gte(schema.emails.createdAt, email.sentAt ?? email.createdAt),
          ),
        )
        .orderBy(desc(schema.emails.createdAt))
    : [];

  const opens = events.filter((e) => e.type === "email_open");
  const clicks = events.filter((e) => e.type === "link_click");
  const linkById = new Map(links.map((l) => [l.id, l]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/sent" className="link" style={{ fontSize: 13 }}>← Sent</Link>
        <span className="dim">/</span>
        <span className="muted" style={{ fontSize: 13 }}>email #{email.id}</span>
      </div>

      {/* Header card */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{email.subject}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              <div><span className="muted">To:</span> {email.toAddr ?? "—"}</div>
              <div><span className="muted">From:</span> {email.fromAddr ?? "—"}</div>
              {email.inReplyTo && <div><span className="muted">In-reply-to:</span> <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{email.inReplyTo}</span></div>}
              <div><span className="muted">Sent:</span> {fmt(email.sentAt ?? email.createdAt)}</div>
              {prospect && (
                <div><span className="muted">Prospect:</span> <Link href={`/prospects/${prospect.slug}`} className="link">{prospect.business}</Link></div>
              )}
              {email.resendMessageId && (
                <div><span className="muted">Resend ID:</span> <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{email.resendMessageId}</span></div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span className={`pill ${email.resendMessageId ? "blue" : "slate"}`}>{email.resendMessageId ? "sent via resend" : "logged"}</span>
              {opens.length > 0 && <span className="pill blue">{opens.length} open{opens.length === 1 ? "" : "s"}</span>}
              {clicks.length > 0 && <span className="pill purple">{clicks.length} click{clicks.length === 1 ? "" : "s"}</span>}
              {replies.length > 0 && <span className="pill green">{replies.length} repl{replies.length === 1 ? "y" : "ies"}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Tracked links */}
      <div className="card">
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontSize: 12, color: "var(--sub)", textTransform: "uppercase", letterSpacing: ".06em" }}>
          Tracked links ({links.length})
        </div>
        {links.length === 0 ? (
          <div style={{ padding: 14, color: "var(--sub)", fontSize: 13 }}>No tracked links in this email.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Code</th>
                <th>Target</th>
                <th style={{ width: 80 }}>Clicks</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{l.code}</td>
                  <td style={{ wordBreak: "break-all" }}>
                    <a href={l.target} target="_blank" rel="noreferrer" className="link" style={{ fontSize: 12 }}>{l.target}</a>
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums", color: l.clickCount > 0 ? "var(--purple)" : "var(--dim)" }}>{l.clickCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Event timeline */}
      <div className="card">
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontSize: 12, color: "var(--sub)", textTransform: "uppercase", letterSpacing: ".06em" }}>
          Activity ({events.length})
        </div>
        {events.length === 0 ? (
          <div style={{ padding: 14, color: "var(--sub)", fontSize: 13 }}>No tracking events recorded yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 120 }}>When</th>
                <th style={{ width: 110 }}>Type</th>
                <th>Detail</th>
                <th style={{ width: 140 }}>IP</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const link = e.linkId ? linkById.get(e.linkId) : null;
                return (
                  <tr key={e.id}>
                    <td className="muted" style={{ fontSize: 12 }} title={fmt(e.occurredAt)}>{relTime(e.occurredAt)}</td>
                    <td><span className={`pill ${TYPE_PILL[e.type] ?? "slate"}`}>{e.type}</span></td>
                    <td style={{ fontSize: 12 }}>
                      {link ? (
                        <a href={link.target} target="_blank" rel="noreferrer" className="link" style={{ wordBreak: "break-all" }}>{link.target}</a>
                      ) : e.userAgent ? (
                        <span className="muted" style={{ fontSize: 11 }}>{e.userAgent}</span>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>{e.ipAddr ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="card">
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontSize: 12, color: "var(--sub)", textTransform: "uppercase", letterSpacing: ".06em" }}>
            Replies ({replies.length})
          </div>
          {replies.map((r) => (
            <div key={r.id} style={{ padding: 14, borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontSize: 13, marginBottom: 4 }}><strong>{r.subject}</strong></div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                From {r.fromAddr ?? "—"} · {fmt(r.sentAt ?? r.createdAt)}
              </div>
              {r.bodyText && (
                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, margin: 0, color: "var(--ink)" }}>{r.bodyText}</pre>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="card">
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontSize: 12, color: "var(--sub)", textTransform: "uppercase", letterSpacing: ".06em", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Body</span>
          <span className="dim" style={{ fontSize: 11 }}>{email.bodyText ? `${email.bodyText.length} chars` : ""}</span>
        </div>
        {email.bodyText ? (
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, margin: 0, padding: 16, color: "var(--ink)" }}>{email.bodyText}</pre>
        ) : email.bodyHtml ? (
          <div style={{ padding: 16 }} dangerouslySetInnerHTML={{ __html: email.bodyHtml }} />
        ) : (
          <div style={{ padding: 16, color: "var(--sub)", fontSize: 13 }}>No body stored.</div>
        )}
      </div>
    </div>
  );
}
