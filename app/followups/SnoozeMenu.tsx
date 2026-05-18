"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { snooze } from "./actions";

const PRESETS = [
  { d: 1, label: "1d" },
  { d: 3, label: "3d" },
  { d: 7, label: "1w" },
  { d: 30, label: "1mo" },
];

export function SnoozeMenu({ slug, isSnoozed }: { slug: string; isSnoozed: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (isSnoozed) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { await snooze(slug, null); router.refresh(); })}
        style={{ fontSize: 11, padding: "3px 8px" }}
      >
        unsnooze
      </button>
    );
  }
  return (
    <div style={{ display: "flex", gap: 2 }}>
      <span className="dim" style={{ fontSize: 10, alignSelf: "center", marginRight: 4 }}>snooze:</span>
      {PRESETS.map((p) => (
        <button
          key={p.d}
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await snooze(slug, p.d); router.refresh(); })}
          className="ghost"
          style={{ fontSize: 11, padding: "3px 7px" }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
