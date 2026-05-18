import Link from "next/link";
import { db, schema } from "@/lib/db";
import { eq, desc, and, isNull, or, ilike } from "drizzle-orm";
import { InboxRow } from "./InboxRow";
import { InboxSearch } from "./InboxSearch";
import { InboxKeys } from "./InboxKeys";

export const dynamic = "force-dynamic";

export default async function Inbox({ searchParams }: { searchParams: Promise<{ unread?: string; q?: string; archived?: string }> }) {
  const sp = await searchParams;
  const onlyUnread = sp.unread === "1";
  const showArchived = sp.archived === "1";
  const q = (sp.q ?? "").trim();

  const filters: any[] = [eq(schema.emails.direction, "inbound")];
  if (onlyUnread) filters.push(isNull(schema.emails.readAt));
  if (!showArchived) filters.push(isNull(schema.emails.archivedAt));
  if (q) {
    const like = `%${q}%`;
    filters.push(
      or(
        ilike(schema.emails.subject, like),
        ilike(schema.emails.fromAddr, like),
        ilike(schema.emails.bodyText, like),
        ilike(schema.prospects.business, like),
      ),
    );
  }

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
      archivedAt: schema.emails.archivedAt,
      prospectId: schema.emails.prospectId,
      slug: schema.prospects.slug,
      business: schema.prospects.business,
      pitchUrl: schema.prospects.pitchUrl,
    })
    .from(schema.emails)
    .leftJoin(schema.prospects, eq(schema.emails.prospectId, schema.prospects.id))
    .where(and(...filters))
    .orderBy(desc(schema.emails.sentAt))
    .limit(200);

  const unreadCount = onlyUnread
    ? rows.length
    : rows.filter((r) => !r.readAt).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Inbox</h1>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            All inbound replies across every prospect. {unreadCount > 0 ? <strong style={{ color: "var(--accent)" }}>{unreadCount} unread</strong> : <span className="dim">all read</span>}
            {q && <> · matching <code style={{ color: "var(--warn)" }}>{q}</code></>}.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Link href={q ? `/inbox?q=${encodeURIComponent(q)}` : "/inbox"} className={`pill ${!onlyUnread && !showArchived ? "active" : "slate"} clickable`}>inbox</Link>
          <Link href={q ? `/inbox?unread=1&q=${encodeURIComponent(q)}` : "/inbox?unread=1"} className={`pill ${onlyUnread ? "active" : "slate"} clickable`}>unread</Link>
          <Link href={q ? `/inbox?archived=1&q=${encodeURIComponent(q)}` : "/inbox?archived=1"} className={`pill ${showArchived ? "active" : "slate"} clickable`}>archived</Link>
        </div>
      </div>

      <InboxSearch initial={q} unread={onlyUnread} />
      <InboxKeys />

      <div className="card" style={{ overflow: "hidden" }}>
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center" }}>
            <span className="dim">{q ? "no matches" : onlyUnread ? "no unread messages" : "no inbound mail yet"}</span>
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
