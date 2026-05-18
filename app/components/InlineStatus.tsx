"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStatus } from "@/app/prospects/[slug]/actions";

const STATUSES = [
  "lead",
  "researched",
  "mock_built",
  "emailed",
  "opened",
  "clicked",
  "replied",
  "meeting",
  "won",
  "lost",
  "ignored",
] as const;

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

export function InlineStatus({ slug, status }: { slug: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) =>
        start(async () => {
          await updateStatus(slug, e.target.value as any);
          router.refresh();
        })
      }
      onClick={(e) => e.stopPropagation()}
      style={{
        appearance: "none",
        padding: "2px 8px",
        fontSize: 11,
        background: "transparent",
        borderRadius: 999,
        border: "1px solid var(--line)",
        cursor: "pointer",
      }}
      className={`pill ${STATUS_PILL[status] ?? "slate"} clickable`}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s} style={{ background: "var(--bg)", color: "var(--ink)" }}>
          {s.replace("_", " ")}
        </option>
      ))}
    </select>
  );
}
