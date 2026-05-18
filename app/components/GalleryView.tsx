import Link from "next/link";
import { Thumbnail } from "./Thumbnail";
import { InlineStatus } from "./InlineStatus";

type SP = { q?: string; status?: string; region?: string; industry?: string; tag?: string; view?: string };

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

export function GalleryView({ rows, opens, clicks, sp }: { rows: any[]; opens: Map<number | null, number>; clicks: Map<number | null, number>; sp: SP }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
      {rows.map((p) => {
        const ops = opens.get(p.id) ?? 0;
        const cls = clicks.get(p.id) ?? 0;
        return (
          <div key={p.id} className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <Link href={`/prospects/${p.slug}`} style={{ display: "block" }}>
              <Thumbnail pitchUrl={p.pitchUrl} size="md" business={p.business} />
            </Link>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
                <Link href={`/prospects/${p.slug}`} style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", lineHeight: 1.3 }}>
                  {p.business}
                </Link>
                <InlineStatus slug={p.slug} status={p.status} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {p.location && (
                  <Link href={buildFacetHref(sp, "region", p.location)} className="pill slate clickable">{p.location}</Link>
                )}
                {p.industry && (
                  <Link href={buildFacetHref(sp, "industry", p.industry)} className="pill purple clickable">{p.industry}</Link>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <div style={{ display: "flex", gap: 10, fontSize: 11 }}>
                  <span style={{ color: ops > 0 ? "var(--warn)" : "var(--dim)" }}>👁 {ops}</span>
                  <span style={{ color: cls > 0 ? "var(--warn)" : "var(--dim)" }}>↗ {cls}</span>
                </div>
                {p.pitchUrl && (
                  <a href={p.pitchUrl} target="_blank" rel="noreferrer" className="link" style={{ fontSize: 11 }}>open ↗</a>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {rows.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center", gridColumn: "1 / -1" }}>
          <span className="dim">no prospects match</span>
        </div>
      )}
    </div>
  );
}
