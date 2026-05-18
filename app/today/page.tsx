import Link from "next/link";
import { db, schema } from "@/lib/db";
import { and, eq, desc, isNull, isNotNull, gt, count } from "drizzle-orm";
import { computeFollowups } from "@/lib/followups";
import { TodayActions } from "./TodayActions";

export const dynamic = "force-dynamic";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default async function Today() {
  const now = new Date();

  // 1. Unread inbound — replies needing action
  const replies = await db
    .select({
      id: schema.emails.id,
      subject: schema.emails.subject,
      fromAddr: schema.emails.fromAddr,
      bodyText: schema.emails.bodyText,
      sentAt: schema.emails.sentAt,
      createdAt: schema.emails.createdAt,
      slug: schema.prospects.slug,
      business: schema.prospects.business,
      contactEmail: schema.prospects.contactEmail,
      prospectId: schema.emails.prospectId,
    })
    .from(schema.emails)
    .leftJoin(schema.prospects, eq(schema.emails.prospectId, schema.prospects.id))
    .where(and(eq(schema.emails.direction, "inbound"), isNull(schema.emails.readAt), isNull(schema.emails.archivedAt)))
    .orderBy(desc(schema.emails.sentAt))
    .limit(20);

  // 2. Follow-ups due (uses existing helper; 5+ days since last outbound, no reply)
  const followups = (await computeFollowups({})).slice(0, 20);

  // 3. Ready to send: mock_built + has email + no outbound yet, not snoozed
  const allProspects = await db.select().from(schema.prospects);
  const outboundCounts = await db
    .select({ pid: schema.emails.prospectId, n: count() })
    .from(schema.emails)
    .where(eq(schema.emails.direction, "outbound"))
    .groupBy(schema.emails.prospectId);
  const outboundMap = new Map(outboundCounts.map((r) => [r.pid, Number(r.n)]));
  const readyToSend = allProspects
    .filter((p) => p.status === "mock_built" && p.contactEmail && (outboundMap.get(p.id) ?? 0) === 0)
    .filter((p) => !p.snoozedUntil || new Date(p.snoozedUntil).getTime() <= now.getTime())
    .slice(0, 20);

  // 4. Warm leads: opens/clicks but no reply, not yet in followup window
  const warmCounts = await db
    .select({ pid: schema.events.prospectId, n: count() })
    .from(schema.events)
    .where(eq(schema.events.type, "email_open"))
    .groupBy(schema.events.prospectId);
  const warmMap = new Map(warmCounts.map((r) => [r.pid, Number(r.n)]));
  const warm = allProspects
    .filter((p) => (warmMap.get(p.id) ?? 0) > 0 && p.status !== "replied" && p.status !== "won" && p.status !== "lost" && p.status !== "ignored")
    .filter((p) => !p.snoozedUntil || new Date(p.snoozedUntil).getTime() <= now.getTime())
    .filter((p) => !followups.some((f) => f.prospect.id === p.id))
    .sort((a, b) => (warmMap.get(b.id) ?? 0) - (warmMap.get(a.id) ?? 0))
    .slice(0, 10);

  const totalToDo = replies.length + followups.length + readyToSend.length;
  const hasFollowupTemplate = await db.select().from(schema.emailTemplates).where(eq(schema.emailTemplates.scope, "followup")).limit(1);
  const hasColdTemplate = await db.select().from(schema.emailTemplates).where(eq(schema.emailTemplates.scope, "cold")).limit(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{greeting()}</h1>
        <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          {totalToDo === 0
            ? "You're all caught up. Time to build more proposals."
            : `${totalToDo} item${totalToDo === 1 ? "" : "s"} on your plate today — work top to bottom.`}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <Stat label="Replies" n={replies.length} hue="green" />
        <Stat label="Follow-ups due" n={followups.length} hue="amber" />
        <Stat label="Ready to send" n={readyToSend.length} hue="blue" />
        <Stat label="Warm but quiet" n={warm.length} hue="purple" />
      </div>

      {/* Section 1: replies */}
      <Section
        title="🔥 New replies — respond"
        subtitle="Someone wrote back. This is where the gold is."
        empty="No new replies. Mailbox zero."
      >
        {replies.map((r) => (
          <div key={r.id} className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <div style={{ minWidth: 0 }}>
                <Link href={`/prospects/${r.slug}#email-${r.id}`} className="link" style={{ fontWeight: 600, fontSize: 14 }}>{r.business ?? "Unmatched"}</Link>
                <div className="dim" style={{ fontSize: 11 }}>{r.fromAddr} · {new Date(r.sentAt ?? r.createdAt).toLocaleString()}</div>
              </div>
            </div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{r.subject}</div>
            <div className="dim" style={{ fontSize: 12, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {r.bodyText?.split("\n").filter((l) => !l.startsWith(">")).join(" ").slice(0, 240) ?? "(no body)"}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Link href={`/prospects/${r.slug}#email-${r.id}`} className="primary" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, textDecoration: "none" }}>↩ open + reply</Link>
              {r.slug && <TodayActions slug={r.slug} business={r.business ?? ""} kind="reply" />}
            </div>
          </div>
        ))}
      </Section>

      {/* Section 2: follow-ups */}
      <Section
        title="⏰ Follow-ups due — one click"
        subtitle="Emailed 5+ days ago, no response. Send the bump email."
        empty="No follow-ups due. You're current."
      >
        {!hasFollowupTemplate.length && followups.length > 0 && (
          <div className="card" style={{ padding: 12, borderColor: "var(--warn)", background: "rgba(251,191,36,.05)" }}>
            <span style={{ fontSize: 13 }}>⚠ No <code>followup</code>-scoped template exists yet. </span>
            <Link href="/templates" className="link" style={{ fontSize: 13 }}>Add one</Link> to enable one-click follow-ups.
          </div>
        )}
        {followups.map((f) => (
          <div key={f.prospect.id} className="card" style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <Link href={`/prospects/${f.prospect.slug}`} className="link" style={{ fontWeight: 600, fontSize: 14 }}>{f.prospect.business}</Link>
                <span className="dim" style={{ fontSize: 11 }}>· {f.prospect.contactEmail ?? "no email"}</span>
              </div>
              <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                last sent <strong style={{ color: f.daysSinceSent >= 14 ? "var(--bad)" : f.daysSinceSent >= 7 ? "var(--warn)" : "var(--sub)" }}>{f.daysSinceSent}d ago</strong>
                {f.lastSubject && <> · "{f.lastSubject}"</>}
              </div>
            </div>
            <TodayActions slug={f.prospect.slug} business={f.prospect.business} kind="followup" disabled={!f.prospect.contactEmail || !hasFollowupTemplate.length} />
          </div>
        ))}
      </Section>

      {/* Section 3: ready to send */}
      <Section
        title="📤 Ready to send — first pitch"
        subtitle="Mock is built, contact is set, never been emailed."
        empty="No one ready to send. Either you've emailed everyone or contacts need filling in."
      >
        {!hasColdTemplate.length && readyToSend.length > 0 && (
          <div className="card" style={{ padding: 12, borderColor: "var(--warn)", background: "rgba(251,191,36,.05)" }}>
            <span style={{ fontSize: 13 }}>⚠ No <code>cold</code>-scoped template exists yet. </span>
            <Link href="/templates" className="link" style={{ fontSize: 13 }}>Add one</Link> to enable one-click sends.
          </div>
        )}
        {readyToSend.map((p) => {
          const hasIssues = !!p.pitchIssues?.trim();
          return (
            <div key={p.id} className="card" style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <Link href={`/prospects/${p.slug}`} className="link" style={{ fontWeight: 600, fontSize: 14 }}>{p.business}</Link>
                  <span className="dim" style={{ fontSize: 11 }}>· {p.contactEmail}</span>
                  {!hasIssues && <span className="pill amber" style={{ fontSize: 10 }}>needs issues</span>}
                </div>
                <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
                  {[p.location, p.industry].filter(Boolean).join(" · ")} {p.pitchUrl && <>· <a href={p.pitchUrl} target="_blank" rel="noreferrer" className="link">mock ↗</a></>}
                </div>
                {hasIssues && (
                  <div className="dim" style={{ fontSize: 11, marginTop: 4, fontStyle: "italic", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
                    {p.pitchIssues!.slice(0, 200)}{(p.pitchIssues?.length ?? 0) > 200 ? "…" : ""}
                  </div>
                )}
              </div>
              {hasIssues ? (
                <TodayActions slug={p.slug} business={p.business} kind="cold" disabled={!hasColdTemplate.length} />
              ) : (
                <Link href={`/prospects/${p.slug}#pitch-issues-form`} className="primary" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, textDecoration: "none" }}>
                  ✏ add issues
                </Link>
              )}
            </div>
          );
        })}
      </Section>

      {/* Section 4: warm leads */}
      {warm.length > 0 && (
        <Section
          title="👁 Warm but quiet — they opened, never replied"
          subtitle="Maybe a different angle, or a soft nudge."
          empty=""
        >
          {warm.map((p) => (
            <div key={p.id} className="card" style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <Link href={`/prospects/${p.slug}`} className="link" style={{ fontWeight: 600, fontSize: 14 }}>{p.business}</Link>
                <div className="dim" style={{ fontSize: 11 }}>{warmMap.get(p.id)} open{(warmMap.get(p.id) ?? 0) === 1 ? "" : "s"} · status: {p.status}</div>
              </div>
              <Link href={`/prospects/${p.slug}`} className="ghost" style={{ padding: "5px 10px", borderRadius: 6, fontSize: 12, textDecoration: "none" }}>view →</Link>
            </div>
          ))}
        </Section>
      )}

      {totalToDo === 0 && (
        <div className="card" style={{ padding: 30, textAlign: "center", borderColor: "var(--accent)", background: "var(--accent-dim)" }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🎉</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Inbox zero on outreach.</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Time to build a few more pitches. Spin up new mocks in <code>../agency</code>, run <code>pnpm import:pitches</code> to ingest them, then come back here.</div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, n, hue }: { label: string; n: number; hue: "green" | "amber" | "blue" | "purple" }) {
  const colorMap: Record<string, string> = {
    green: "var(--accent)", amber: "var(--warn)", blue: "var(--blue)", purple: "var(--purple)",
  };
  return (
    <div className="card" style={{ padding: 14, textAlign: "center" }}>
      <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, marginTop: 4, color: n > 0 ? colorMap[hue] : "var(--dim)" }}>{n}</div>
    </div>
  );
}

function Section({ title, subtitle, empty, children }: { title: string; subtitle: string; empty: string; children: any }) {
  const hasChildren = Array.isArray(children) ? children.some((c: any) => c) : !!children;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h2>
        <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>{subtitle}</div>
      </div>
      {hasChildren ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
      ) : empty ? (
        <div className="card" style={{ padding: 14, textAlign: "center" }}><span className="dim" style={{ fontSize: 12 }}>{empty}</span></div>
      ) : null}
    </div>
  );
}
