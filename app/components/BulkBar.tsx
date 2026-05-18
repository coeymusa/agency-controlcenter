"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkSetStatus, bulkAddTag, bulkSnooze, bulkDelete } from "@/app/prospects/[slug]/actions";

const STATUSES = [
  "lead", "researched", "mock_built", "emailed", "opened",
  "clicked", "replied", "meeting", "won", "lost", "ignored",
] as const;

export function BulkBar({ selected, clear }: { selected: Set<string>; clear: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tagInput, setTagInput] = useState("");
  const count = selected.size;

  if (count === 0) return null;
  const slugs = Array.from(selected);

  const refresh = () => { clear(); router.refresh(); };

  return (
    <div
      style={{
        position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
        background: "var(--panel)", border: "1px solid var(--line-2)", borderRadius: 12,
        padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
        boxShadow: "0 8px 24px rgba(0,0,0,.5)", zIndex: 50,
        flexWrap: "wrap", maxWidth: "calc(100vw - 40px)",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600 }}>{count} selected</span>
      <span className="dim">·</span>

      <select
        disabled={pending}
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          start(async () => { await bulkSetStatus(slugs, v as any); refresh(); });
          e.target.value = "";
        }}
        style={{ fontSize: 12, padding: "4px 8px" }}
      >
        <option value="">set status…</option>
        {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
      </select>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!tagInput.trim()) return;
          start(async () => { await bulkAddTag(slugs, tagInput.trim()); setTagInput(""); refresh(); });
        }}
        style={{ display: "flex", gap: 4 }}
      >
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="add tag"
          style={{ width: 100, fontSize: 12, padding: "4px 8px" }}
        />
        <button type="submit" disabled={pending} className="ghost" style={{ fontSize: 12, padding: "4px 8px" }}>+</button>
      </form>

      <select
        disabled={pending}
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          const days = v === "clear" ? null : parseInt(v, 10);
          start(async () => { await bulkSnooze(slugs, days); refresh(); });
          e.target.value = "";
        }}
        style={{ fontSize: 12, padding: "4px 8px" }}
      >
        <option value="">snooze…</option>
        <option value="1">1 day</option>
        <option value="3">3 days</option>
        <option value="7">1 week</option>
        <option value="30">1 month</option>
        <option value="clear">unsnooze</option>
      </select>

      <button
        type="button"
        disabled={pending}
        style={{ background: "#3a1717", borderColor: "#5a1f1f", color: "#fca5a5", fontSize: 12 }}
        onClick={() => {
          if (typeof window !== "undefined" && window.confirm(`Delete ${count} prospect${count === 1 ? "" : "s"}?`)) {
            start(async () => { await bulkDelete(slugs); refresh(); });
          }
        }}
      >
        delete
      </button>

      <span className="dim">·</span>
      <button type="button" className="ghost" onClick={clear} disabled={pending} style={{ fontSize: 12 }}>
        clear
      </button>
    </div>
  );
}
