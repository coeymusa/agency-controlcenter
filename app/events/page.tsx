import Link from "next/link";
import { db, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const TYPE_PILL: Record<string, string> = {
  email_sent: "blue",
  email_open: "amber",
  link_click: "amber",
  email_reply: "green",
  note: "slate",
  status_change: "slate",
};

export default async function EventsPage() {
  const rows = await db
    .select({
      id: schema.events.id,
      type: schema.events.type,
      occurredAt: schema.events.occurredAt,
      metadata: schema.events.metadata,
      slug: schema.prospects.slug,
      business: schema.prospects.business,
    })
    .from(schema.events)
    .leftJoin(schema.prospects, eq(schema.events.prospectId, schema.prospects.id))
    .orderBy(desc(schema.events.occurredAt))
    .limit(500);

  return (
    <div className="card">
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #1f1f24", fontWeight: 600 }}>Events ({rows.length})</div>
      <table>
        <thead><tr><th>Type</th><th>Prospect</th><th>Details</th><th>When</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><span className={`pill ${TYPE_PILL[r.type] ?? "slate"}`}>{r.type.replace("_", " ")}</span></td>
              <td>{r.slug ? <Link href={`/prospects/${r.slug}`} className="link">{r.business}</Link> : <span className="muted">—</span>}</td>
              <td className="muted" style={{ fontSize: 12 }}>{r.metadata ? JSON.stringify(r.metadata) : ""}</td>
              <td className="muted" style={{ fontSize: 12 }}>{new Date(r.occurredAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
