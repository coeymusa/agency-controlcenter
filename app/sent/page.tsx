import Link from "next/link";
import { db, schema } from "@/lib/db";
import { desc, eq, inArray, sql, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

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

export default async function SentPage() {
  const sent = await db
    .select({
      id: schema.emails.id,
      subject: schema.emails.subject,
      toAddr: schema.emails.toAddr,
      fromAddr: schema.emails.fromAddr,
      sentAt: schema.emails.sentAt,
      createdAt: schema.emails.createdAt,
      resendMessageId: schema.emails.resendMessageId,
      prospectId: schema.emails.prospectId,
      slug: schema.prospects.slug,
      business: schema.prospects.business,
      prospectStatus: schema.prospects.status,
    })
    .from(schema.emails)
    .leftJoin(schema.prospects, eq(schema.emails.prospectId, schema.prospects.id))
    .where(eq(schema.emails.direction, "outbound"))
    .orderBy(desc(sql`coalesce(${schema.emails.sentAt}, ${schema.emails.createdAt})`))
    .limit(300);

  const ids = sent.map((r) => r.id);
  const prospectIds = Array.from(new Set(sent.map((r) => r.prospectId).filter((x): x is number => !!x)));

  // Aggregate events per email
  type AggRow = { emailId: number | null; type: string; n: number; last: Date | null };
  const eventAgg: AggRow[] = ids.length
    ? ((await db
        .select({
          emailId: schema.events.emailId,
          type: schema.events.type,
          n: sql<number>`count(*)::int`,
          last: sql<Date | null>`max(${schema.events.occurredAt})`,
        })
        .from(schema.events)
        .where(inArray(schema.events.emailId, ids))
        .groupBy(schema.events.emailId, schema.events.type)) as AggRow[])
    : [];

  // Replies: inbound emails per prospect (counted after the outbound send timestamp)
  const replyRows = prospectIds.length
    ? await db
        .select({
          prospectId: schema.emails.prospectId,
          n: sql<number>`count(*)::int`,
          last: sql<Date | null>`max(coalesce(${schema.emails.sentAt}, ${schema.emails.createdAt}))`,
        })
        .from(schema.emails)
        .where(and(eq(schema.emails.direction, "inbound"), inArray(schema.emails.prospectId, prospectIds)))
        .groupBy(schema.emails.prospectId)
    : [];

  const aggByEmail = new Map<number, { opens: number; clicks: number; lastOpen: Date | null; lastClick: Date | null }>();
  for (const r of eventAgg) {
    if (r.emailId == null) continue;
    const cur = aggByEmail.get(r.emailId) ?? { opens: 0, clicks: 0, lastOpen: null, lastClick: null };
    if (r.type === "email_open") {
      cur.opens = Number(r.n);
      cur.lastOpen = r.last;
    } else if (r.type === "link_click") {
      cur.clicks = Number(r.n);
      cur.lastClick = r.last;
    }
    aggByEmail.set(r.emailId, cur);
  }

  const replyByProspect = new Map<number, { n: number; last: Date | null }>();
  for (const r of replyRows) {
    if (r.prospectId == null) continue;
    replyByProspect.set(r.prospectId, { n: Number(r.n), last: r.last });
  }

  type Bucket = "Today" | "Yesterday" | "This week" | "This month" | "Earlier" | "Undated";
  const order: Bucket[] = ["Today", "Yesterday", "This week", "This month", "Earlier", "Undated"];
  const buckets = new Map<Bucket, typeof sent>();
  for (const r of sent) {
    const b = dayBucket(r.sentAt ?? r.createdAt) as Bucket;
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(r);
  }

  // Totals
  const total = sent.length;
  const opened = sent.filter((r) => (aggByEmail.get(r.id)?.opens ?? 0) > 0).length;
  const clicked = sent.filter((r) => (aggByEmail.get(r.id)?.clicks ?? 0) > 0).length;
  const replied = sent.filter((r) => r.prospectId != null && (replyByProspect.get(r.prospectId)?.n ?? 0) > 0).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>Sent</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="pill slate">{total} sent</span>
          <span className="pill blue">{opened} opened</span>
          <span className="pill purple">{clicked} clicked</span>
          <span className="pill green">{replied} replied</span>
        </div>
      </div>

      {sent.length === 0 ? (
        <div className="card" style={{ padding: 24, color: "var(--sub)" }}>No outbound emails yet.</div>
      ) : (
        order
          .filter((b) => buckets.has(b))
          .map((b) => {
            const rows = buckets.get(b)!;
            return (
              <div key={b} className="card">
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--sub)", textTransform: "uppercase", letterSpacing: ".06em" }}>
                  <span>{b}</span>
                  <span className="dim" style={{ fontVariantNumeric: "tabular-nums" }}>{rows.length}</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Sent</th>
                      <th>Subject</th>
                      <th>Prospect</th>
                      <th>To</th>
                      <th style={{ width: 60 }}>Opens</th>
                      <th style={{ width: 60 }}>Clicks</th>
                      <th style={{ width: 140 }}>Status</th>
                      <th style={{ width: 110 }}>Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const a = aggByEmail.get(r.id) ?? { opens: 0, clicks: 0, lastOpen: null, lastClick: null };
                      const rep = r.prospectId != null ? replyByProspect.get(r.prospectId) : undefined;
                      const lastAct = [a.lastOpen, a.lastClick, rep?.last]
                        .filter((d): d is Date => !!d)
                        .map((d) => new Date(d).getTime())
                        .sort((x, y) => y - x)[0];
                      const lastActDate = lastAct ? new Date(lastAct) : null;

                      const pills: { label: string; cls: string }[] = [];
                      if (!r.resendMessageId) pills.push({ label: "logged", cls: "slate" });
                      else pills.push({ label: "sent", cls: "blue" });
                      if (a.opens > 0) pills.push({ label: "opened", cls: "blue" });
                      if (a.clicks > 0) pills.push({ label: "clicked", cls: "purple" });
                      if (rep && rep.n > 0) pills.push({ label: "replied", cls: "green" });

                      return (
                        <tr key={r.id}>
                          <td className="muted" style={{ fontSize: 12 }} title={(r.sentAt ?? r.createdAt) ? new Date(r.sentAt ?? r.createdAt).toLocaleString() : ""}>
                            {relTime(r.sentAt ?? r.createdAt)}
                          </td>
                          <td>
                            <Link href={`/sent/${r.id}`} className="link" style={{ color: "var(--ink)" }}>{r.subject}</Link>
                          </td>
                          <td>
                            {r.slug ? <Link href={`/prospects/${r.slug}`} className="link">{r.business}</Link> : <span className="muted">—</span>}
                          </td>
                          <td className="muted" style={{ fontSize: 12 }}>{r.toAddr ?? "—"}</td>
                          <td style={{ fontVariantNumeric: "tabular-nums", color: a.opens > 0 ? "var(--blue)" : "var(--dim)" }}>{a.opens}</td>
                          <td style={{ fontVariantNumeric: "tabular-nums", color: a.clicks > 0 ? "var(--purple)" : "var(--dim)" }}>{a.clicks}</td>
                          <td>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {pills.map((p, i) => (
                                <span key={i} className={`pill ${p.cls}`}>{p.label}</span>
                              ))}
                            </div>
                          </td>
                          <td className="muted" style={{ fontSize: 12 }} title={lastActDate ? lastActDate.toLocaleString() : ""}>
                            {relTime(lastActDate)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })
      )}
    </div>
  );
}
