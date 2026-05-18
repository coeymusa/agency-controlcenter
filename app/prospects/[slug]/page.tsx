import { notFound } from "next/navigation";
import Link from "next/link";
import { db, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { EditPanel } from "./EditPanel";
import { ComposerArea } from "./ComposerArea";
import { getSetting } from "@/lib/settings";
import { desc as desc2 } from "drizzle-orm";

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
        vars={{
          business: prospect.business,
          contactName: prospect.contactName,
          contactEmail: prospect.contactEmail,
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
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #1f1f24", fontWeight: 600 }}>Tracked Links</div>
          <table>
            <thead><tr><th>Label</th><th>Target</th><th>Code</th><th style={{ textAlign: "right" }}>Clicks</th></tr></thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id}>
                  <td>{l.label ?? "—"}</td>
                  <td><a href={l.target} target="_blank" rel="noreferrer" className="link">{l.target}</a></td>
                  <td className="muted"><code>{l.code}</code></td>
                  <td style={{ textAlign: "right" }}>{l.clickCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
