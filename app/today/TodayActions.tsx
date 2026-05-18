"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { oneClickSend, dismissToday } from "./actions";

type Kind = "cold" | "followup" | "reply";

export function TodayActions({ slug, business, kind, disabled }: { slug: string; business: string; kind: Kind; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const sendLabel = kind === "followup" ? "send follow-up" : kind === "cold" ? "send pitch" : "reply";
  const scope: "cold" | "followup" | "breakup" | "other" = kind === "followup" ? "followup" : "cold";

  if (msg) {
    return <span style={{ fontSize: 11, color: msg.startsWith("✓") ? "var(--accent)" : "var(--bad)" }}>{msg}</span>;
  }

  return (
    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
      {kind !== "reply" && (
        <button
          type="button"
          className="primary"
          disabled={pending || disabled}
          style={{ fontSize: 12, padding: "6px 12px" }}
          onClick={() => {
            if (typeof window !== "undefined" && !window.confirm(`Send ${kind === "followup" ? "follow-up" : "pitch"} to ${business}?`)) return;
            start(async () => {
              const r = await oneClickSend(slug, scope);
              if ("ok" in r && r.ok) {
                setMsg("✓ sent");
                setTimeout(() => router.refresh(), 800);
              } else if ("error" in r) {
                setMsg("✗ " + r.error);
              }
            });
          }}
        >
          {pending ? "sending…" : "📧 " + sendLabel}
        </button>
      )}
      <button
        type="button"
        className="ghost"
        disabled={pending}
        style={{ fontSize: 11, padding: "5px 10px" }}
        title="snooze 1 day"
        onClick={() => start(async () => { await dismissToday(slug, 1); router.refresh(); })}
      >
        💤 1d
      </button>
      <button
        type="button"
        className="ghost"
        disabled={pending}
        style={{ fontSize: 11, padding: "5px 10px" }}
        title="snooze 3 days"
        onClick={() => start(async () => { await dismissToday(slug, 3); router.refresh(); })}
      >
        💤 3d
      </button>
    </div>
  );
}
