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

type Filter = "all" | "engaged" | "clicked" | "replied" | "silent";

const FILTERS: { id: Filter; label: string; hint: string }[] = [
  { id: "all", label: "All", hint: "every send" },
  { id: "engaged", label: "Opened", hint: "at least one open" },
  { id: "clicked", label: "Clicked", hint: "clicked the preview link" },
  { id: "replied", label: "Replied", hint: "wrote back" },
  { id: "silent", label: "Silent", hint: "no movement" },
];

export default async function SentPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  const sp = await searchParams;
  const filter: Filter = (FILTERS.some((f) => f.id === sp.filter) ? sp.filter : "all") as Filter;
  const q = (sp.q ?? "").trim().toLowerCase();

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
  type AggRow = { emailId: number | null; type: string; n: number; first: Date | null; last: Date | null };
  const eventAgg: AggRow[] = ids.length
    ? ((await db
        .select({
          emailId: schema.events.emailId,
          type: schema.events.type,
          n: sql<number>`count(*)::int`,
          first: sql<Date | null>`min(${schema.events.occurredAt})`,
          last: sql<Date | null>`max(${schema.events.occurredAt})`,
        })
        .from(schema.events)
        .where(inArray(schema.events.emailId, ids))
        .groupBy(schema.events.emailId, schema.events.type)) as AggRow[])
    : [];

  // Replies
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

  const aggByEmail = new Map<number, { opens: number; clicks: number; firstOpen: Date | null; lastOpen: Date | null; lastClick: Date | null }>();
  for (const r of eventAgg) {
    if (r.emailId == null) continue;
    const cur = aggByEmail.get(r.emailId) ?? { opens: 0, clicks: 0, firstOpen: null, lastOpen: null, lastClick: null };
    if (r.type === "email_open") {
      cur.opens = Number(r.n);
      cur.firstOpen = r.first;
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

  // Recent activity feed: latest 40 open/click/reply events across all sends
  const recentActivity = await db
    .select({
      eventId: schema.events.id,
      type: schema.events.type,
      occurredAt: schema.events.occurredAt,
      emailId: schema.events.emailId,
      prospectId: schema.events.prospectId,
      slug: schema.prospects.slug,
      business: schema.prospects.business,
      subject: schema.emails.subject,
    })
    .from(schema.events)
    .leftJoin(schema.emails, eq(schema.events.emailId, schema.emails.id))
    .leftJoin(schema.prospects, eq(schema.events.prospectId, schema.prospects.id))
    .where(inArray(schema.events.type, ["email_open", "link_click", "email_reply"]))
    .orderBy(desc(schema.events.occurredAt))
    .limit(40);

  // Decorate sent rows with derived fields for filter + sort
  const decorated = sent.map((r) => {
    const a = aggByEmail.get(r.id) ?? { opens: 0, clicks: 0, firstOpen: null, lastOpen: null, lastClick: null };
    const rep = r.prospectId != null ? replyByProspect.get(r.prospectId) : undefined;
    const lastActMs = [a.lastOpen, a.lastClick, rep?.last]
      .filter((d): d is Date => !!d)
      .map((d) => new Date(d).getTime())
      .sort((x, y) => y - x)[0];
    return { row: r, agg: a, rep, lastActMs };
  });

  // Apply filter
  const filtered = decorated.filter(({ agg, rep }) => {
    if (filter === "engaged") return agg.opens > 0;
    if (filter === "clicked") return agg.clicks > 0;
    if (filter === "replied") return (rep?.n ?? 0) > 0;
    if (filter === "silent") return agg.opens === 0 && agg.clicks === 0 && (rep?.n ?? 0) === 0;
    return true;
  }).filter(({ row }) => {
    if (!q) return true;
    return (
      (row.business?.toLowerCase().includes(q) ?? false) ||
      (row.subject?.toLowerCase().includes(q) ?? false) ||
      (row.toAddr?.toLowerCase().includes(q) ?? false)
    );
  });

  // Bucket filtered rows by send-date
  type Bucket = "Today" | "Yesterday" | "This week" | "This month" | "Earlier" | "Undated";
  const order: Bucket[] = ["Today", "Yesterday", "This week", "This month", "Earlier", "Undated"];
  const buckets = new Map<Bucket, typeof filtered>();
  for (const r of filtered) {
    const b = dayBucket(r.row.sentAt ?? r.row.createdAt) as Bucket;
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(r);
  }

  // Activity feed buckets
  type ActRow = (typeof recentActivity)[number];
  const actBuckets = new Map<Bucket, ActRow[]>();
  for (const r of recentActivity) {
    const b = dayBucket(r.occurredAt) as Bucket;
    if (!actBuckets.has(b)) actBuckets.set(b, []);
    actBuckets.get(b)!.push(r);
  }

  // Totals (from unfiltered set)
  const total = sent.length;
  const opened = decorated.filter(({ agg }) => agg.opens > 0).length;
  const clicked = decorated.filter(({ agg }) => agg.clicks > 0).length;
  const replied = decorated.filter(({ rep }) => (rep?.n ?? 0) > 0).length;
  const silent = total - opened;
  const counts: Record<Filter, number> = { all: total, engaged: opened, clicked, replied, silent };

  const now = Date.now();
  const HOT_MS = 24 * 3600_000;

  const qHref = (f: Filter) => {
    const params = new URLSearchParams();
    if (f !== "all") params.set("filter", f);
    if (q) params.set("q", q);
    const s = params.toString();
    return s ? `/sent?${s}` : "/sent";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>Sent</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="pill slate">{total} sent</span>
          <span className="pill blue">{opened} opened</span>
          <span className="pill purple">{clicked} clicked</span>
          <span className="pill green">{replied} replied</span>
        </div>
      </div>

      {/* Recent activity feed — what happened most recently, regardless of send date */}
      {recentActivity.length > 0 && (
        <div className="card">
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>📡 Recent activity</span>
              <span className="dim" style={{ fontSize: 11 }}>opens, clicks, replies — newest first</span>
            </div>
            <span className="dim" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{recentActivity.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {order
              .filter((b) => actBuckets.has(b))
              .map((b) => {
                const items = actBuckets.get(b)!;
                return (
                  <div key={b}>
                    <div style={{ padding: "6px 14px", background: "var(--bg-soft, rgba(255,255,255,0.02))", fontSize: 11, color: "var(--sub)", textTransform: "uppercase", letterSpacing: ".06em", display: "flex", gap: 8 }}>
                      <span>{b}</span>
                      <span className="dim">{items.length}</span>
                    </div>
                    {items.map((a) => {
                      const icon = a.type === "email_open" ? "👁" : a.type === "link_click" ? "🔗" : "↩";
                      const verb = a.type === "email_open" ? "opened" : a.type === "link_click" ? "clicked" : "replied to";
                      const color = a.type === "email_open" ? "var(--blue)" : a.type === "link_click" ? "var(--purple)" : "var(--accent)";
                      return (
                        <div key={a.eventId} style={{ padding: "8px 14px", borderTop: "1px solid var(--line)", display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
                          <span style={{ fontSize: 14, width: 18, textAlign: "center" }}>{icon}</span>
                          <span className="muted" style={{ fontSize: 11, width: 70, fontVariantNumeric: "tabular-nums" }} title={new Date(a.occurredAt).toLocaleString()}>
                            {relTime(a.occurredAt)}
                          </span>
                          <span style={{ color, fontSize: 12, width: 70 }}>{verb}</span>
                          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {a.slug ? <Link href={`/prospects/${a.slug}`} className="link" style={{ fontWeight: 500 }}>{a.business}</Link> : <span className="muted">{a.business ?? "Unknown"}</span>}
                            {a.subject && <span className="muted" style={{ fontSize: 12 }}> · {a.subject}</span>}
                          </span>
                          {a.emailId && (
                            <Link href={`/sent/${a.emailId}`} className="link" style={{ fontSize: 11, flexShrink: 0 }}>open ↗</Link>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Filter + search bar */}
      <div className="card" style={{ padding: "10px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <Link
              key={f.id}
              href={qHref(f.id)}
              className={f.id === filter ? "pill blue" : "pill slate"}
              style={{ textDecoration: "none", cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}
              title={f.hint}
            >
              <span>{f.label}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.7 }}>{counts[f.id]}</span>
            </Link>
          ))}
        </div>
        <form method="get" action="/sent" style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="search prospect, subject, email…"
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--line)", background: "transparent", color: "var(--ink)", fontSize: 12, minWidth: 240 }}
          />
          {q && (
            <Link href={qHref(filter).replace(/[?&]q=[^&]*/, "")} className="ghost" style={{ padding: "5px 10px", borderRadius: 6, fontSize: 11, textDecoration: "none" }}>
              clear
            </Link>
          )}
        </form>
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 24, color: "var(--sub)" }}>
          {sent.length === 0 ? "No outbound emails yet." : `No sends match this filter${q ? " or search" : ""}.`}
        </div>
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
                      <th style={{ width: 90 }}>Opens</th>
                      <th style={{ width: 80 }}>Clicks</th>
                      <th style={{ width: 150 }}>Status</th>
                      <th style={{ width: 110 }}>Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ row: r, agg: a, rep }) => {
                      const lastActMs = [a.lastOpen, a.lastClick, rep?.last]
                        .filter((d): d is Date => !!d)
                        .map((d) => new Date(d).getTime())
                        .sort((x, y) => y - x)[0];
                      const lastActDate = lastActMs ? new Date(lastActMs) : null;
                      const isHot = lastActMs && now - lastActMs < HOT_MS;

                      const pills: { label: string; cls: string }[] = [];
                      if (!r.resendMessageId) pills.push({ label: "logged", cls: "slate" });
                      else pills.push({ label: "sent", cls: "blue" });
                      if (a.opens > 0) pills.push({ label: `${a.opens}× open`, cls: "blue" });
                      if (a.clicks > 0) pills.push({ label: `${a.clicks}× click`, cls: "purple" });
                      if (rep && rep.n > 0) pills.push({ label: rep.n > 1 ? `${rep.n}× reply` : "replied", cls: "green" });

                      return (
                        <tr key={r.id} style={isHot ? { boxShadow: "inset 2px 0 0 var(--accent)" } : undefined}>
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
                          <td style={{ fontVariantNumeric: "tabular-nums", color: a.opens > 0 ? "var(--blue)" : "var(--dim)" }} title={a.firstOpen ? `first open: ${new Date(a.firstOpen).toLocaleString()}\nlast open: ${a.lastOpen ? new Date(a.lastOpen).toLocaleString() : "—"}` : ""}>
                            {a.opens > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <span>{a.opens}</span>
                                {a.lastOpen && <span className="dim" style={{ fontSize: 10 }}>{relTime(a.lastOpen)}</span>}
                              </div>
                            ) : "0"}
                          </td>
                          <td style={{ fontVariantNumeric: "tabular-nums", color: a.clicks > 0 ? "var(--purple)" : "var(--dim)" }}>
                            {a.clicks > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <span>{a.clicks}</span>
                                {a.lastClick && <span className="dim" style={{ fontSize: 10 }}>{relTime(a.lastClick)}</span>}
                              </div>
                            ) : "0"}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {pills.map((p, i) => (
                                <span key={i} className={`pill ${p.cls}`} style={{ fontSize: 10 }}>{p.label}</span>
                              ))}
                            </div>
                          </td>
                          <td className="muted" style={{ fontSize: 12 }} title={lastActDate ? lastActDate.toLocaleString() : ""}>
                            {lastActDate ? (
                              <span style={isHot ? { color: "var(--accent)", fontWeight: 500 } : undefined}>
                                {relTime(lastActDate)}
                              </span>
                            ) : (
                              <span className="dim">silent</span>
                            )}
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
