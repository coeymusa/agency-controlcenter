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
          location: prospect.location,
          industry: prospect.industry,
        }}
      />

      <div className="card">
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", fontWeight: 600 }}>Activity</div>
        {events.length === 0 && <div style={{ padding: 14 }} className="muted">No events yet.</div>}
        {events.slice(0, 50).map((ev) => (
          <div key={ev.id} style={{ padding: "8px 14px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span className={`pill ${TYPE_PILL[ev.type] ?? "slate"}`}>{ev.type.replace("_", " ")}</span>
            <span className="muted" style={{ fontSize: 11 }}>{new Date(ev.occurredAt).toLocaleString()}</span>
          </div>
        ))}
      </div>

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
