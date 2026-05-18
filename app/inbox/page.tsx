import Link from "next/link";
import { db, schema } from "@/lib/db";
import { eq, desc, and, isNull } from "drizzle-orm";
import { InboxRow } from "./InboxRow";

export const dynamic = "force-dynamic";

export default async function Inbox({ searchParams }: { searchParams: Promise<{ unread?: string }> }) {
  const sp = await searchParams;
  const onlyUnread = sp.unread === "1";

  const baseWhere = onlyUnread
    ? and(eq(schema.emails.direction, "inbound"), isNull(schema.emails.readAt))
    : eq(schema.emails.direction, "inbound");

  const rows = await db
    .select({
      id: schema.emails.id,
      subject: schema.emails.subject,
      fromAddr: schema.emails.fromAddr,
      bodyText: schema.emails.bodyText,
      bodyHtml: schema.emails.bodyHtml,
      sentAt: schema.emails.sentAt,
      createdAt: schema.emails.createdAt,
      readAt: schema.emails.readAt,
      prospectId: schema.emails.prospectId,
      slug: schema.prospects.slug,
      business: schema.prospects.business,
      pitchUrl: schema.prospects.pitchUrl,
    })
    .from(schema.emails)
    .leftJoin(schema.prospects, eq(schema.emails.prospectId, schema.prospects.id))
    .where(baseWhere)
    .orderBy(desc(schema.emails.sentAt))
    .limit(200);

  const unreadCount = onlyUnread
    ? rows.length
    : rows.filter((r) => !r.readAt).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Inbox</h1>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            All inbound replies across every prospect. {unreadCount > 0 ? <strong style={{ color: "var(--accent)" }}>{unreadCount} unread</strong> : <span className="dim">all read</span>}.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Link href="/inbox" className={`pill ${!onlyUnread ? "active" : "slate"} clickable`}>all</Link>
          <Link href="/inbox?unread=1" className={`pill ${onlyUnread ? "active" : "slate"} clickable`}>unread only</Link>
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center" }}>
            <span className="dim">{onlyUnread ? "no unread messages" : "no inbound mail yet"}</span>
          </div>
        ) : (
          <div>
            {rows.map((r) => (
              <InboxRow key={r.id} row={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
