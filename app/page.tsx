import Link from "next/link";
import { db, schema } from "@/lib/db";
import { desc, eq, count, and, isNull } from "drizzle-orm";
import { ALL_STATUSES } from "@/lib/classify";
import { Sidebar, type Facet } from "./components/Sidebar";
import { SearchBox } from "./components/SearchBox";
import { InlineStatus } from "./components/InlineStatus";
import { StatsStrip } from "./components/StatsStrip";
import { Thumbnail } from "./components/Thumbnail";
import { ProspectsView } from "./components/ProspectsView";
import { computeFollowups } from "@/lib/followups";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_PILL: Record<string, string> = {
  lead: "slate",
  researched: "slate",
  mock_built: "blue",
  emailed: "blue",
  opened: "amber",
  clicked: "amber",
  replied: "green",
  meeting: "green",
  won: "green",
  lost: "red",
  ignored: "red",
};

type SP = {
  q?: string;
  status?: string;
  region?: string;
  industry?: string;
  tag?: string;
  view?: "list" | "gallery" | "kanban" | "region" | "industry" | "status";
};

export default async function Home({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const view = (sp.view ?? "list") as NonNullable<SP["view"]>;

  const all = await db.select().from(schema.prospects).orderBy(desc(schema.prospects.updatedAt));

  // Build facet counts from the unfiltered set so user can always see the
  // full menu of regions/sectors/tags they could pick.
  const statusCounts: Record<string, number> = {};
  const regionCounts: Record<string, number> = {};
  const sectorCounts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};
  for (const p of all) {
    statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
    if (p.location) regionCounts[p.location] = (regionCounts[p.location] ?? 0) + 1;
    if (p.industry) sectorCounts[p.industry] = (sectorCounts[p.industry] ?? 0) + 1;
    for (const t of (p.tags ?? []) as string[]) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
  }

  // Apply filters
  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = all.filter((p) => {
    if (sp.status && p.status !== sp.status) return false;
    if (sp.region && p.location !== sp.region) return false;
    if (sp.industry && p.industry !== sp.industry) return false;
    if (sp.tag && !((p.tags ?? []) as string[]).includes(sp.tag)) return false;
    if (q) {
      const hay = [p.business, p.slug, p.contactName, p.contactEmail, p.website, p.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Open / click totals per prospect
  const opensByProspect = await db
    .select({ pid: schema.events.prospectId, n: count() })
    .from(schema.events)
    .where(eq(schema.events.type, "email_open"))
    .groupBy(schema.events.prospectId);
  const clicksByProspect = await db
    .select({ pid: schema.events.prospectId, n: count() })
    .from(schema.events)
    .where(eq(schema.events.type, "link_click"))
    .groupBy(schema.events.prospectId);
  const opensMap = new Map(opensByProspect.map((r) => [r.pid, Number(r.n)]));
  const clicksMap = new Map(clicksByProspect.map((r) => [r.pid, Number(r.n)]));

  const unreadByProspect = await db
    .select({ pid: schema.emails.prospectId, n: count() })
    .from(schema.emails)
    .where(and(eq(schema.emails.direction, "inbound"), isNull(schema.emails.readAt)))
    .groupBy(schema.emails.prospectId);
  const unreadMap = new Map(unreadByProspect.map((r) => [r.pid, Number(r.n)]));

  const totalByStatus = ALL_STATUSES.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: 0 }), {});
  for (const p of all) totalByStatus[p.status] = (totalByStatus[p.status] ?? 0) + 1;

  const followupRows = await computeFollowups({});
  const followupCount = followupRows.length;

  const statusFacets: Facet[] = ALL_STATUSES.filter((s) => (statusCounts[s] ?? 0) > 0).map((s) => ({
    value: s,
    label: s.replace("_", " "),
    count: statusCounts[s] ?? 0,
    pill: STATUS_PILL[s],
  }));
  const regionFacets: Facet[] = Object.entries(regionCounts)
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count);
  const sectorFacets: Facet[] = Object.entries(sectorCounts)
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count);
  const tagFacets: Facet[] = Object.entries(tagCounts)
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      <Sidebar
        sp={sp as Record<string, string>}
        statuses={statusFacets}
        regions={regionFacets}
        sectors={sectorFacets}
        tags={tagFacets}
      />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <StatsStrip totals={totalByStatus} total={all.length} activeStatus={sp.status} followupCount={followupCount} />

        <div className="card" style={{ padding: 10, display: "flex", gap: 10, alignItems: "center" }}>
          <SearchBox initial={sp.q ?? ""} />
          <ViewSwitcher current={view} sp={sp} />
        </div>

        {(view === "list" || view === "gallery" || view === "kanban") && (
          <ProspectsView
            rows={filtered}
            opens={Object.fromEntries(opensMap)}
            clicks={Object.fromEntries(clicksMap)}
            unread={Object.fromEntries(unreadMap)}
            view={view}
            sp={sp}
          />
        )}
        {view === "region" && <Grouped rows={filtered} keyFn={(p) => p.location ?? "(no region)"} opens={opensMap} clicks={clicksMap} sp={sp} />}
        {view === "industry" && <Grouped rows={filtered} keyFn={(p) => p.industry ?? "(no sector)"} opens={opensMap} clicks={clicksMap} sp={sp} />}
        {view === "status" && <Grouped rows={filtered} keyFn={(p) => p.status} opens={opensMap} clicks={clicksMap} sp={sp} />}
      </div>
    </div>
  );
}

function ViewSwitcher({ current, sp }: { current: string; sp: SP }) {
  const opts = [
    { v: "list", label: "list" },
    { v: "gallery", label: "gallery" },
    { v: "kanban", label: "kanban" },
    { v: "region", label: "by region" },
    { v: "industry", label: "by sector" },
    { v: "status", label: "by status" },
  ];
  return (
    <div style={{ display: "flex", gap: 4, padding: 2, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8 }}>
      {opts.map((o) => {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(sp)) {
          if (typeof v === "string" && v && k !== "view") params.set(k, v);
        }
        if (o.v !== "list") params.set("view", o.v);
        const href = params.toString() ? `/?${params.toString()}` : "/";
        const isActive = current === o.v || (!current && o.v === "list");
        return (
          <Link
            key={o.v}
            href={href}
            scroll={false}
            style={{
              fontSize: 12, padding: "5px 10px", borderRadius: 6,
              background: isActive ? "var(--line)" : "transparent",
              color: isActive ? "var(--ink)" : "var(--sub)",
            }}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

function buildFacetHref(sp: SP, key: string, value: string): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v) params.set(k, v);
  }
  if (params.get(key) === value) params.delete(key);
  else params.set(key, value);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

function FlatTable({ rows, opens, clicks, sp }: { rows: any[]; opens: Map<number | null, number>; clicks: Map<number | null, number>; sp: SP }) {
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Prospects · {rows.length}</div>
        <div className="dim" style={{ fontSize: 11 }}>click any pill to filter</div>
      </div>
      <ProspectTable rows={rows} opens={opens} clicks={clicks} sp={sp} />
    </div>
  );
}

function Grouped({ rows, keyFn, opens, clicks, sp }: { rows: any[]; keyFn: (p: any) => string; opens: Map<number | null, number>; clicks: Map<number | null, number>; sp: SP }) {
  const groups = new Map<string, any[]>();
  for (const r of rows) {
    const k = keyFn(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const sorted = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {sorted.map(([k, grp]) => (
        <div key={k} className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{k}</div>
            <div className="dim" style={{ fontSize: 11 }}>{grp.length}</div>
          </div>
          <ProspectTable rows={grp} opens={opens} clicks={clicks} sp={sp} />
        </div>
      ))}
      {sorted.length === 0 && <div className="card" style={{ padding: 20, textAlign: "center" }} ><span className="dim">no prospects match</span></div>}
    </div>
  );
}

function ProspectTable({ rows, opens, clicks, sp }: { rows: any[]; opens: Map<number | null, number>; clicks: Map<number | null, number>; sp: SP }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Business</th>
          <th>Region</th>
          <th>Sector</th>
          <th>Status</th>
          <th style={{ textAlign: "right" }}>Opens</th>
          <th style={{ textAlign: "right" }}>Clicks</th>
          <th>Pitch</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const ops = opens.get(p.id) ?? 0;
          const cls = clicks.get(p.id) ?? 0;
          return (
            <tr key={p.id}>
              <td>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Link href={`/prospects/${p.slug}`} style={{ flexShrink: 0 }}>
                    <Thumbnail pitchUrl={p.pitchUrl} size="sm" business={p.business} />
                  </Link>
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/prospects/${p.slug}`} className="link" style={{ fontWeight: 500 }}>{p.business}</Link>
                    {p.contactEmail && <div className="dim" style={{ fontSize: 11 }}>{p.contactEmail}</div>}
                  </div>
                </div>
              </td>
              <td>
                {p.location ? (
                  <Link href={buildFacetHref(sp, "region", p.location)} className="pill slate clickable">{p.location}</Link>
                ) : (
                  <span className="dim">—</span>
                )}
              </td>
              <td>
                {p.industry ? (
                  <Link href={buildFacetHref(sp, "industry", p.industry)} className="pill purple clickable">{p.industry}</Link>
                ) : (
                  <span className="dim">—</span>
                )}
              </td>
              <td><InlineStatus slug={p.slug} status={p.status} /></td>
              <td style={{ textAlign: "right", color: ops > 0 ? "var(--warn)" : "var(--dim)", fontVariantNumeric: "tabular-nums" }}>{ops}</td>
              <td style={{ textAlign: "right", color: cls > 0 ? "var(--warn)" : "var(--dim)", fontVariantNumeric: "tabular-nums" }}>{cls}</td>
              <td>{p.pitchUrl ? <a href={p.pitchUrl} target="_blank" rel="noreferrer" className="link" style={{ fontSize: 12 }}>open ↗</a> : <span className="dim">—</span>}</td>
              <td className="dim" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{relativeTime(p.updatedAt)}</td>
            </tr>
          );
        })}
        {rows.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", padding: 24 }}><span className="dim">no prospects</span></td></tr>}
      </tbody>
    </table>
  );
}

function relativeTime(t: Date | string): string {
  const date = t instanceof Date ? t : new Date(t);
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 86400 * 7) return Math.floor(s / 86400) + "d ago";
  return date.toLocaleDateString();
}
