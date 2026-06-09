import { notFound } from "next/navigation";
import Link from "next/link";
import { db, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { EditPanel } from "./EditPanel";
import { ComposerArea } from "./ComposerArea";
import { getSetting } from "@/lib/settings";
import { desc as desc2, sql, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

const TYPE_PILL: Record<string, string> = {
  email_sent: "blue",
  email_open: "amber",
  link_click: "amber",
  email_reply: "green",
  note: "slate",
  status_change: "slate",
};

export default async function ProspectDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [prospect] = await db
    .select()
    .from(schema.prospects)
    .where(eq(schema.prospects.slug, slug))
    .limit(1);
  if (!prospect) notFound();

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
  const links = await db
    .select()
    .from(schema.links)
    .where(eq(schema.links.prospectId, prospect.id));
  const [draft] = await db
    .select()
    .from(schema.emailDrafts)
    .where(eq(schema.emailDrafts.prospectId, prospect.id))
    .limit(1);

  // Per-email tracking aggregates for outbound emails in this thread
  const outboundIds = emails.filter((e) => e.direction === "outbound").map((e) => e.id);
  const trackRows = outboundIds.length
    ? await db
        .select({
          emailId: schema.events.emailId,
          type: schema.events.type,
          n: sql<number>`count(*)::int`,
          first: sql<Date | null>`min(${schema.events.occurredAt})`,
          last: sql<Date | null>`max(${schema.events.occurredAt})`,
        })
        .from(schema.events)
        .where(inArray(schema.events.emailId, outboundIds))
        .groupBy(schema.events.emailId, schema.events.type)
    : [];
  const tracking: Record<number, { opens: number; clicks: number; firstOpenAt: Date | null; lastOpenAt: Date | null; lastClickAt: Date | null }> = {};
  for (const r of trackRows) {
    if (r.emailId == null) continue;
    if (!tracking[r.emailId]) tracking[r.emailId] = { opens: 0, clicks: 0, firstOpenAt: null, lastOpenAt: null, lastClickAt: null };
    const slot = tracking[r.emailId];
    if (r.type === "email_open") { slot.opens = Number(r.n); slot.firstOpenAt = r.first; slot.lastOpenAt = r.last; }
    else if (r.type === "link_click") { slot.clicks = Number(r.n); slot.lastClickAt = r.last; }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <Link href="/" className="muted" style={{ fontSize: 12 }}>← all prospects</Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>{prospect.business}</h1>
        <div className="muted" style={{ fontSize: 13 }}>
          {[prospect.industry, prospect.location].filter(Boolean).join(" · ")}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <Stat label="status" value={prospect.status} />
          <Stat label="contact" value={prospect.contactName ?? "—"} />
          <Stat label="email" value={prospect.contactEmail ?? "—"} />
          <Stat label="website" value={prospect.website ? <a href={prospect.website} target="_blank" rel="noreferrer" className="link">{prospect.website}</a> : "—"} />
        </div>
        {prospect.pitchUrl && (
          <div style={{ marginTop: 14, fontSize: 13 }}>
            pitch → <a className="link" href={prospect.pitchUrl} target="_blank" rel="noreferrer">{prospect.pitchUrl}</a>
          </div>
        )}
        {prospect.notes && (
          <div style={{ marginTop: 12, fontSize: 13, whiteSpace: "pre-wrap" }}>{prospect.notes}</div>
        )}
      </div>

      <ComposerArea
        slug={prospect.slug}
        defaultTo={prospect.contactEmail ?? ""}
        defaultFrom={(await getSetting("RESEND_FROM")) ?? ""}
        pitchUrl={prospect.pitchUrl}
        business={prospect.business}
        prospectId={prospect.id}
        templates={(await db.select().from(schema.emailTemplates).orderBy(desc2(schema.emailTemplates.updatedAt))).map((t) => ({ id: t.id, name: t.name, scope: t.scope, subject: t.subject, body: t.body }))}
        initialDraft={draft ? { subject: draft.subject, body: draft.body, fromAddr: draft.fromAddr, toAddr: draft.toAddr, inReplyTo: draft.inReplyTo, updatedAt: draft.updatedAt } : null}
        tracking={tracking}
        vars={{
          business: prospect.business,
          contactName: prospect.contactName,
          contactEmail: prospect.contactEmail,
          website: prospect.website,
          pitchUrl: prospect.pitchUrl,
          pitchIssues: prospect.pitchIssues,
          location: prospect.location,
          industry: prospect.industry,
          signature: (await getSetting("DEFAULT_SIGNATURE")) ?? "",
        }}
        emails={emails.map((e) => ({
          id: e.id,
          direction: e.direction,
          subject: e.subject,
          bodyText: e.bodyText,
          bodyHtml: e.bodyHtml,
          fromAddr: e.fromAddr,
          toAddr: e.toAddr,
          sentAt: e.sentAt,
          createdAt: e.createdAt,
          readAt: e.readAt,
          internetMessageId: e.internetMessageId,
          resendMessageId: e.resendMessageId,
        }))}
      />

      <EditPanel
        prospect={{
          slug: prospect.slug,
          status: prospect.status,
          tags: (prospect.tags ?? []) as string[],
          notes: prospect.notes,
          contactName: prospect.contactName,
          contactEmail: prospect.contactEmail,
          website: prospect.website,
          pitchUrl: prospect.pitchUrl,
          pitchIssues: prospect.pitchIssues,
          location: prospect.location,
          industry: prospect.industry,
        }}
      />

      {/* Timeline: merged chronological stream of emails (sent + received) + events (opens, clicks, notes, status changes) */}
      <Timeline emails={emails} events={events} links={links} />

      {links.length > 0 && (
        <div className="card">
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", fontWeight: 600 }}>Tracked Links · {links.length}</div>
          {links.map((l) => {
            const linkClicks = events.filter((ev) => ev.linkId === l.id && ev.type === "link_click");
            return (
              <div key={l.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {l.label && <div style={{ fontSize: 12, fontWeight: 500 }}>{l.label}</div>}
                    <a href={l.target} target="_blank" rel="noreferrer" className="link" style={{ fontSize: 12, wordBreak: "break-all" }}>{l.target}</a>
                    <div className="dim" style={{ fontSize: 10, marginTop: 2 }}>
                      code <code>{l.code}</code>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 600, color: l.clickCount > 0 ? "var(--warn)" : "var(--dim)", fontVariantNumeric: "tabular-nums" }}>{l.clickCount}</div>
                    <div className="dim" style={{ fontSize: 10 }}>click{l.clickCount === 1 ? "" : "s"}</div>
                  </div>
                </div>
                {linkClicks.length > 0 && (
                  <details style={{ fontSize: 11 }}>
                    <summary className="muted" style={{ cursor: "pointer" }}>{linkClicks.length} click event{linkClicks.length === 1 ? "" : "s"}</summary>
                    <div style={{ paddingLeft: 14, paddingTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                      {linkClicks.slice(0, 20).map((ev) => (
                        <div key={ev.id} style={{ display: "flex", gap: 10, color: "var(--sub)", fontSize: 11 }}>
                          <span className="dim" style={{ fontVariantNumeric: "tabular-nums" }}>{new Date(ev.occurredAt).toLocaleString()}</span>
                          {ev.ipAddr && <span className="dim">· {ev.ipAddr}</span>}
                          {ev.userAgent && <span className="dim" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ev.userAgent}>· {ev.userAgent.slice(0, 30)}…</span>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 14 }}>{value}</div>
    </div>
  );
}

type TLItem =
  | { kind: "email_out"; at: Date; id: number; subject: string | null; bodyText: string | null; readAt: Date | null; resendMessageId: string | null }
  | { kind: "email_in"; at: Date; id: number; subject: string | null; bodyText: string | null; fromAddr: string | null }
  | { kind: "open"; at: Date; emailId: number | null }
  | { kind: "click"; at: Date; emailId: number | null; linkTarget: string | null; linkLabel: string | null }
  | { kind: "note"; at: Date; text: string }
  | { kind: "status_change"; at: Date; from: string | null; to: string | null };

function relTime(d: Date | null | undefined): string {
  if (!d) return "—";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 86400 * 30) return Math.floor(s / 86400) + "d ago";
  return new Date(d).toLocaleDateString();
}

function dayBucket(d: Date | null | undefined): string {
  if (!d) return "Undated";
  const dt = new Date(d);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((startToday.getTime() - new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  if (diffDays < 30) return "This month";
  return "Earlier";
}

function Timeline({ emails, events, links }: { emails: any[]; events: any[]; links: any[] }) {
  // Merge into chronological items. Skip email_sent / email_reply events — those duplicate the emails table rows.
  const linkById = new Map<number, any>(links.map((l) => [l.id, l]));
  const items: TLItem[] = [];
  for (const e of emails) {
    if (e.direction === "outbound") {
      items.push({ kind: "email_out", at: new Date(e.sentAt ?? e.createdAt), id: e.id, subject: e.subject, bodyText: e.bodyText, readAt: e.readAt, resendMessageId: e.resendMessageId });
    } else if (e.direction === "inbound") {
      items.push({ kind: "email_in", at: new Date(e.sentAt ?? e.createdAt), id: e.id, subject: e.subject, bodyText: e.bodyText, fromAddr: e.fromAddr });
    }
  }
  for (const ev of events) {
    const at = new Date(ev.occurredAt);
    if (ev.type === "email_open") {
      items.push({ kind: "open", at, emailId: ev.emailId });
    } else if (ev.type === "link_click") {
      const lk = ev.linkId ? linkById.get(ev.linkId) : null;
      items.push({ kind: "click", at, emailId: ev.emailId, linkTarget: lk?.target ?? null, linkLabel: lk?.label ?? null });
    } else if (ev.type === "note") {
      items.push({ kind: "note", at, text: ((ev.metadata as any)?.text ?? "") as string });
    } else if (ev.type === "status_change") {
      const meta = (ev.metadata as any) ?? {};
      items.push({ kind: "status_change", at, from: meta.from ?? meta.previousStatus ?? null, to: meta.to ?? meta.newStatus ?? null });
    }
    // email_sent / email_reply skipped — already covered by emails rows
  }
  items.sort((a, b) => b.at.getTime() - a.at.getTime());

  const order = ["Today", "Yesterday", "This week", "This month", "Earlier", "Undated"];
  const buckets = new Map<string, TLItem[]>();
  for (const it of items) {
    const b = dayBucket(it.at);
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(it);
  }

  return (
    <div className="card">
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontWeight: 600 }}>Timeline</span>
        <span className="dim" style={{ fontSize: 11 }}>{items.length} event{items.length === 1 ? "" : "s"} · newest first</span>
      </div>
      {items.length === 0 && <div style={{ padding: 14 }} className="muted">Nothing has happened yet.</div>}
      {order
        .filter((b) => buckets.has(b))
        .map((b) => {
          const xs = buckets.get(b)!;
          return (
            <div key={b}>
              <div style={{ padding: "6px 14px", background: "var(--bg-soft, rgba(255,255,255,0.02))", fontSize: 11, color: "var(--sub)", textTransform: "uppercase", letterSpacing: ".06em", display: "flex", gap: 8 }}>
                <span>{b}</span>
                <span className="dim">{xs.length}</span>
              </div>
              {xs.map((it, i) => (
                <TimelineRow key={`${b}-${i}`} item={it} />
              ))}
            </div>
          );
        })}
    </div>
  );
}

function TimelineRow({ item }: { item: TLItem }) {
  const time = (
    <span className="muted" style={{ fontSize: 11, width: 80, flexShrink: 0, fontVariantNumeric: "tabular-nums" }} title={item.at.toLocaleString()}>
      {relTime(item.at)}
    </span>
  );

  const row = (icon: string, color: string, content: React.ReactNode) => (
    <div style={{ padding: "10px 14px", borderTop: "1px solid var(--line)", display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ fontSize: 14, width: 22, textAlign: "center", flexShrink: 0, color }}>{icon}</span>
      {time}
      <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{content}</div>
    </div>
  );

  switch (item.kind) {
    case "email_out": {
      const preview = (item.bodyText ?? "").replace(/\s+/g, " ").slice(0, 160);
      return row(
        "📤",
        "var(--blue)",
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div>
            <Link href={`/sent/${item.id}`} className="link" style={{ fontWeight: 500 }}>{item.subject ?? "(no subject)"}</Link>
            {!item.resendMessageId && <span className="pill slate" style={{ marginLeft: 8, fontSize: 10 }}>logged</span>}
          </div>
          {preview && <div className="muted" style={{ fontSize: 12, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{preview}</div>}
        </div>,
      );
    }
    case "email_in": {
      const preview = (item.bodyText ?? "").split("\n").filter((l) => !l.startsWith(">")).join(" ").slice(0, 160);
      return row(
        "↩",
        "var(--accent)",
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div>
            <Link href={`#email-${item.id}`} className="link" style={{ fontWeight: 500 }}>{item.subject ?? "(no subject)"}</Link>
            {item.fromAddr && <span className="dim" style={{ marginLeft: 8, fontSize: 11 }}>from {item.fromAddr}</span>}
          </div>
          {preview && <div className="muted" style={{ fontSize: 12, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{preview}</div>}
        </div>,
      );
    }
    case "open":
      return row("👁", "var(--warn)", <span>they opened the email{item.emailId ? <> · <Link href={`/sent/${item.emailId}`} className="link" style={{ fontSize: 11 }}>open send ↗</Link></> : null}</span>);
    case "click":
      return row(
        "🔗",
        "var(--purple)",
        <span>
          they clicked{item.linkLabel ? ` "${item.linkLabel}"` : item.linkTarget ? <> <a href={item.linkTarget} target="_blank" rel="noreferrer" className="link" style={{ wordBreak: "break-all" }}>{item.linkTarget}</a></> : ""}
          {item.emailId && <span className="dim" style={{ fontSize: 11 }}> · <Link href={`/sent/${item.emailId}`} className="link">send</Link></span>}
        </span>,
      );
    case "note":
      return row("📝", "var(--sub)", <span style={{ whiteSpace: "pre-wrap" }}>{item.text || "(empty note)"}</span>);
    case "status_change":
      return row(
        "🔄",
        "var(--sub)",
        <span>
          status changed
          {item.from && <> from <strong>{item.from}</strong></>}
          {item.to && <> to <strong>{item.to}</strong></>}
        </span>,
      );
  }
}
