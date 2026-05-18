import Link from "next/link";
import { db, schema } from "@/lib/db";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { CancelButton } from "./CancelButton";

export const dynamic = "force-dynamic";

function whenRel(t: Date | string): string {
  const d = t instanceof Date ? t : new Date(t);
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const dir = diff >= 0 ? "in " : "";
  const suffix = diff >= 0 ? "" : " ago";
  if (abs < 60_000) return dir + Math.round(abs / 1000) + "s" + suffix;
  if (abs < 3_600_000) return dir + Math.round(abs / 60_000) + "m" + suffix;
  if (abs < 86_400_000) return dir + Math.round(abs / 3_600_000) + "h" + suffix;
  return d.toLocaleString();
}

export default async function Scheduled() {
  const rows = await db
    .select({
      id: schema.emails.id,
      subject: schema.emails.subject,
      toAddr: schema.emails.toAddr,
      scheduledFor: schema.emails.scheduledFor,
      createdAt: schema.emails.createdAt,
      prospectId: schema.emails.prospectId,
      slug: schema.prospects.slug,
      business: schema.prospects.business,
    })
    .from(schema.emails)
    .leftJoin(schema.prospects, eq(schema.emails.prospectId, schema.prospects.id))
    .where(and(
      eq(schema.emails.direction, "outbound"),
      isNotNull(schema.emails.scheduledFor),
      isNull(schema.emails.resendMessageId),
    ))
    .orderBy(asc(schema.emails.scheduledFor));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Scheduled</h1>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Emails waiting to send. A cron job dispatches them every minute. Cancel anything before it fires.
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center" }}>
            <span className="dim">Nothing in the queue.</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>To</th>
                <th>Prospect</th>
                <th>Subject</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{whenRel(r.scheduledFor!)}</div>
                    <div className="dim" style={{ fontSize: 11 }}>{new Date(r.scheduledFor!).toLocaleString()}</div>
                  </td>
                  <td className="dim" style={{ fontSize: 12 }}>{r.toAddr ?? "—"}</td>
                  <td>{r.slug ? <Link href={`/prospects/${r.slug}`} className="link">{r.business}</Link> : <span className="dim">—</span>}</td>
                  <td>{r.subject}</td>
                  <td><CancelButton emailId={r.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
