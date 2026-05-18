import Link from "next/link";
import { computeFollowups, FOLLOWUP_DEFAULT_DAYS } from "@/lib/followups";
import { SnoozeMenu } from "./SnoozeMenu";
import { Thumbnail } from "../components/Thumbnail";
import { InlineStatus } from "../components/InlineStatus";

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, string> = {
  emailed: "blue",
  opened: "amber",
  clicked: "amber",
};

export default async function Followups({ searchParams }: { searchParams: Promise<{ days?: string; snoozed?: string }> }) {
  const sp = await searchParams;
  const minDays = sp.days ? parseInt(sp.days, 10) || FOLLOWUP_DEFAULT_DAYS : FOLLOWUP_DEFAULT_DAYS;
  const includeSnoozed = sp.snoozed === "1";
  const rows = await computeFollowups({ minDays, includeSnoozed });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Follow-up queue</h1>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Prospects you emailed {minDays}+ days ago that haven't replied. Sorted oldest first.
        </div>
      </div>

      <div className="card" style={{ padding: 10, display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[3, 5, 7, 14].map((d) => (
            <Link
              key={d}
              href={`/followups?days=${d}${includeSnoozed ? "&snoozed=1" : ""}`}
              className={`pill ${minDays === d ? "active" : "slate"} clickable`}
            >
              {d}+ days
            </Link>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <Link
          href={`/followups?days=${minDays}${includeSnoozed ? "" : "&snoozed=1"}`}
          className={`pill ${includeSnoozed ? "active" : "slate"} clickable`}
        >
          {includeSnoozed ? "✓ showing snoozed" : "show snoozed too"}
        </Link>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{rows.length} to follow up</div>
          <div className="dim" style={{ fontSize: 11 }}>compose a follow-up directly on each prospect</div>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center" }}>
            <span className="dim">Inbox zero on follow-ups. 👌</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th style={{ textAlign: "right" }}>Days ago</th>
                <th>Last subject</th>
                <th>Status</th>
                <th>Region</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.prospect.id} style={{ opacity: r.isSnoozed ? 0.5 : 1 }}>
                  <td>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <Link href={`/prospects/${r.prospect.slug}`} style={{ flexShrink: 0 }}>
                        <Thumbnail pitchUrl={r.prospect.pitchUrl} size="sm" business={r.prospect.business} />
                      </Link>
                      <div style={{ minWidth: 0 }}>
                        <Link href={`/prospects/${r.prospect.slug}`} className="link" style={{ fontWeight: 500 }}>{r.prospect.business}</Link>
                        {r.prospect.contactEmail && <div className="dim" style={{ fontSize: 11 }}>{r.prospect.contactEmail}</div>}
                        {r.isSnoozed && r.prospect.snoozedUntil && (
                          <div className="dim" style={{ fontSize: 10 }}>snoozed until {new Date(r.prospect.snoozedUntil).toLocaleDateString()}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.daysSinceSent >= 14 ? "var(--bad)" : r.daysSinceSent >= 7 ? "var(--warn)" : "var(--sub)" }}>
                    {r.daysSinceSent}
                  </td>
                  <td className="dim" style={{ fontSize: 12 }}>{r.lastSubject ?? "—"}</td>
                  <td><InlineStatus slug={r.prospect.slug} status={r.prospect.status} /></td>
                  <td className="dim">{r.prospect.location ?? "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <Link href={`/prospects/${r.prospect.slug}`} className="link" style={{ fontSize: 11 }}>compose ↗</Link>
                      <SnoozeMenu slug={r.prospect.slug} isSnoozed={r.isSnoozed} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
