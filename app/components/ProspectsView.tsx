"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { Thumbnail } from "./Thumbnail";
import { InlineStatus } from "./InlineStatus";
import { BulkBar } from "./BulkBar";
import { KanbanBoard } from "./KanbanBoard";

type SP = { q?: string; status?: string; region?: string; industry?: string; tag?: string; view?: string };

const STATUS_PILL: Record<string, string> = {
  lead: "slate", researched: "slate", mock_built: "blue", emailed: "blue",
  opened: "amber", clicked: "amber", replied: "green", meeting: "green",
  won: "green", lost: "red", ignored: "red",
};

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

function relativeTime(t: Date | string): string {
  const date = t instanceof Date ? t : new Date(t);
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 86400 * 7) return Math.floor(s / 86400) + "d ago";
  return date.toLocaleDateString();
}

export function ProspectsView({
  rows, opens, clicks, unread, view, sp,
}: {
  rows: any[];
  opens: Record<number, number>;
  clicks: Record<number, number>;
  unread?: Record<number, number>;
  view: "list" | "gallery" | "kanban";
  sp: SP;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const opensMap = useMemo(() => new Map(Object.entries(opens).map(([k, v]) => [Number(k), v])), [opens]);
  const clicksMap = useMemo(() => new Map(Object.entries(clicks).map(([k, v]) => [Number(k), v])), [clicks]);
  const unreadMap = useMemo(() => new Map(Object.entries(unread ?? {}).map(([k, v]) => [Number(k), v])), [unread]);

  function toggle(slug: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  }
  function toggleAll() {
    setSelected((s) => s.size === rows.length ? new Set() : new Set(rows.map((r) => r.slug)));
  }

  if (view === "kanban") {
    return (
      <>
        <KanbanBoard rows={rows} />
        <BulkBar selected={selected} clear={() => setSelected(new Set())} />
      </>
    );
  }

  if (view === "gallery") {
    return (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {rows.map((p) => {
            const isSel = selected.has(p.slug);
            return (
              <div key={p.id} className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column", borderColor: isSel ? "var(--accent)" : "var(--line)", boxShadow: isSel ? "0 0 0 1px var(--accent)" : "none" }}>
                <div style={{ position: "relative" }}>
                  <Link href={`/prospects/${p.slug}`} style={{ display: "block" }}>
                    <Thumbnail pitchUrl={p.pitchUrl} size="md" business={p.business} />
                  </Link>
                  <label style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,.6)", padding: "4px 6px", borderRadius: 6, cursor: "pointer" }} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={isSel} onChange={() => toggle(p.slug)} />
                  </label>
                </div>
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
                    <Link href={`/prospects/${p.slug}`} style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", lineHeight: 1.3 }}>{p.business}</Link>
                    <InlineStatus slug={p.slug} status={p.status} />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {p.location && <Link href={buildFacetHref(sp, "region", p.location)} className="pill slate clickable">{p.location}</Link>}
                    {p.industry && <Link href={buildFacetHref(sp, "industry", p.industry)} className="pill purple clickable">{p.industry}</Link>}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 10, fontSize: 11 }}>
                      <span style={{ color: (opensMap.get(p.id) ?? 0) > 0 ? "var(--warn)" : "var(--dim)" }}>👁 {opensMap.get(p.id) ?? 0}</span>
                      <span style={{ color: (clicksMap.get(p.id) ?? 0) > 0 ? "var(--warn)" : "var(--dim)" }}>↗ {clicksMap.get(p.id) ?? 0}</span>
                    </div>
                    {p.pitchUrl && <a href={p.pitchUrl} target="_blank" rel="noreferrer" className="link" style={{ fontSize: 11 }}>open ↗</a>}
                  </div>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div className="card" style={{ padding: 24, textAlign: "center", gridColumn: "1 / -1" }}><span className="dim">no prospects match</span></div>}
        </div>
        <BulkBar selected={selected} clear={() => setSelected(new Set())} />
      </>
    );
  }

  // list view
  const allSelected = rows.length > 0 && selected.size === rows.length;
  return (
    <>
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Prospects · {rows.length}{selected.size > 0 ? ` · ${selected.size} selected` : ""}</div>
          <div className="dim" style={{ fontSize: 11 }}>click any pill to filter · checkbox to multi-select</div>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all on page" />
              </th>
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
              const isSel = selected.has(p.slug);
              const ops = opensMap.get(p.id) ?? 0;
              const cls = clicksMap.get(p.id) ?? 0;
              return (
                <tr key={p.id} style={isSel ? { background: "rgba(110,231,183,.05)" } : undefined}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={isSel} onChange={() => toggle(p.slug)} />
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <Link href={`/prospects/${p.slug}`} style={{ flexShrink: 0 }}>
                        <Thumbnail pitchUrl={p.pitchUrl} size="sm" business={p.business} />
                      </Link>
                      <div style={{ minWidth: 0 }}>
                        <Link href={`/prospects/${p.slug}`} className="link" style={{ fontWeight: 500 }}>
                          {p.business}
                          {(unreadMap.get(p.id) ?? 0) > 0 && (
                            <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 999, background: "var(--accent)", color: "#06231a", fontWeight: 700 }}>
                              {unreadMap.get(p.id)} new
                            </span>
                          )}
                        </Link>
                        {p.contactEmail && <div className="dim" style={{ fontSize: 11 }}>{p.contactEmail}</div>}
                      </div>
                    </div>
                  </td>
                  <td>{p.location ? <Link href={buildFacetHref(sp, "region", p.location)} className="pill slate clickable">{p.location}</Link> : <span className="dim">—</span>}</td>
                  <td>{p.industry ? <Link href={buildFacetHref(sp, "industry", p.industry)} className="pill purple clickable">{p.industry}</Link> : <span className="dim">—</span>}</td>
                  <td><InlineStatus slug={p.slug} status={p.status} /></td>
                  <td style={{ textAlign: "right", color: ops > 0 ? "var(--warn)" : "var(--dim)", fontVariantNumeric: "tabular-nums" }}>{ops}</td>
                  <td style={{ textAlign: "right", color: cls > 0 ? "var(--warn)" : "var(--dim)", fontVariantNumeric: "tabular-nums" }}>{cls}</td>
                  <td>{p.pitchUrl ? <a href={p.pitchUrl} target="_blank" rel="noreferrer" className="link" style={{ fontSize: 12 }}>open ↗</a> : <span className="dim">—</span>}</td>
                  <td className="dim" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{relativeTime(p.updatedAt)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", padding: 24 }}><span className="dim">no prospects</span></td></tr>}
          </tbody>
        </table>
      </div>
      <BulkBar selected={selected} clear={() => setSelected(new Set())} />
    </>
  );
}
