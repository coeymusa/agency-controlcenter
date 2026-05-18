import Link from "next/link";

export type Facet = { value: string; label: string; count: number; pill?: string };

type Props = {
  sp: Record<string, string | string[] | undefined>;
  statuses: Facet[];
  regions: Facet[];
  sectors: Facet[];
  tags: Facet[];
};

function buildHref(
  sp: Record<string, string | string[] | undefined>,
  toggle: { key: string; value: string },
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v) params.set(k, v);
  }
  if (params.get(toggle.key) === toggle.value) {
    params.delete(toggle.key);
  } else {
    params.set(toggle.key, toggle.value);
  }
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

function Group({ title, items, sp, paramKey }: { title: string; items: Facet[]; sp: Props["sp"]; paramKey: string }) {
  if (items.length === 0) return null;
  const active = typeof sp[paramKey] === "string" ? (sp[paramKey] as string) : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <div className="facet-group-title">{title}</div>
      {items.map((f) => {
        const isActive = active === f.value;
        return (
          <Link
            key={f.value}
            href={buildHref(sp, { key: paramKey, value: f.value })}
            className={`facet-row ${isActive ? "active" : ""}`}
            scroll={false}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              {f.pill ? <span className={`pill ${f.pill}`} style={{ flexShrink: 0 }}>{f.label}</span> : <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label}</span>}
            </span>
            <span className="count">{f.count}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar({ sp, statuses, regions, sectors, tags }: Props) {
  const anyFilter = sp.q || sp.status || sp.region || sp.industry || sp.tag;
  return (
    <aside style={{ width: 240, flexShrink: 0, position: "sticky", top: 80, alignSelf: "flex-start", maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
      {anyFilter && (
        <Link
          href="/"
          className="muted"
          style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", border: "1px solid var(--line)", borderRadius: 6, marginBottom: 10 }}
        >
          ← clear filters
        </Link>
      )}
      <Group title="Status" items={statuses} sp={sp} paramKey="status" />
      <Group title="Region" items={regions} sp={sp} paramKey="region" />
      <Group title="Sector" items={sectors} sp={sp} paramKey="industry" />
      <Group title="Tags" items={tags} sp={sp} paramKey="tag" />
    </aside>
  );
}
