import Link from "next/link";

const ORDER = ["mock_built", "emailed", "opened", "clicked", "replied", "won"] as const;
const COLORS: Record<string, string> = {
  mock_built: "blue",
  emailed: "blue",
  opened: "amber",
  clicked: "amber",
  replied: "green",
  won: "green",
};
const LABELS: Record<string, string> = {
  mock_built: "Mocks built",
  emailed: "Emailed",
  opened: "Opens",
  clicked: "Clicks",
  replied: "Replies",
  won: "Won",
};

export function StatsStrip({ totals, total, activeStatus, followupCount }: { totals: Record<string, number>; total: number; activeStatus?: string; followupCount?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 8 }}>
      <Link href="/" className="card" style={{ padding: 12, textAlign: "center", textDecoration: "none", borderColor: !activeStatus ? "var(--line-2)" : "var(--line)" }}>
        <div className="dim" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>All</div>
        <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>{total}</div>
      </Link>
      {ORDER.map((s) => (
        <Link
          key={s}
          href={`/?status=${s}`}
          className="card"
          style={{
            padding: 12,
            textAlign: "center",
            textDecoration: "none",
            borderColor: activeStatus === s ? `var(--accent)` : "var(--line)",
            background: activeStatus === s ? "var(--accent-dim)" : "var(--panel)",
          }}
        >
          <div className="dim" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>{LABELS[s]}</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2, color: activeStatus === s ? "var(--accent)" : undefined }}>
            {totals[s] ?? 0}
          </div>
        </Link>
      ))}
      <Link
        href="/followups"
        className="card"
        style={{
          padding: 12, textAlign: "center", textDecoration: "none",
          borderColor: followupCount && followupCount > 0 ? "var(--warn)" : "var(--line)",
          background: followupCount && followupCount > 0 ? "rgba(251,191,36,.07)" : "var(--panel)",
        }}
        title="prospects emailed 5+ days ago with no reply"
      >
        <div className="dim" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>Follow-ups</div>
        <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2, color: followupCount && followupCount > 0 ? "var(--warn)" : undefined }}>
          {followupCount ?? 0}
        </div>
      </Link>
    </div>
  );
}
