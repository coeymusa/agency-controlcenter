import Link from "next/link";
import { db, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function EmailsPage() {
  const rows = await db
    .select({
      id: schema.emails.id,
      direction: schema.emails.direction,
      subject: schema.emails.subject,
      toAddr: schema.emails.toAddr,
      fromAddr: schema.emails.fromAddr,
      sentAt: schema.emails.sentAt,
      createdAt: schema.emails.createdAt,
      prospectId: schema.emails.prospectId,
      slug: schema.prospects.slug,
      business: schema.prospects.business,
    })
    .from(schema.emails)
    .leftJoin(schema.prospects, eq(schema.emails.prospectId, schema.prospects.id))
    .orderBy(desc(schema.emails.createdAt))
    .limit(200);

  return (
    <div className="card">
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #1f1f24", fontWeight: 600 }}>Emails ({rows.length})</div>
      <table>
        <thead><tr><th>Dir</th><th>Subject</th><th>Prospect</th><th>To/From</th><th>When</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><span className={`pill ${r.direction === "outbound" ? "blue" : "green"}`}>{r.direction}</span></td>
              <td>{r.subject}</td>
              <td>{r.slug ? <Link href={`/prospects/${r.slug}`} className="link">{r.business}</Link> : <span className="muted">—</span>}</td>
              <td className="muted">{r.direction === "outbound" ? r.toAddr : r.fromAddr}</td>
              <td className="muted" style={{ fontSize: 12 }}>{(r.sentAt ?? r.createdAt) ? new Date(r.sentAt ?? r.createdAt).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
