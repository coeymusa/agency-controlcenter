"use client";
import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markEmailRead, markEmailUnread } from "./actions";

function relTime(t: Date | string | null): string {
  if (!t) return "—";
  const date = t instanceof Date ? t : new Date(t);
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  if (s < 86400 * 7) return Math.floor(s / 86400) + "d";
  return date.toLocaleDateString();
}

function snippet(text: string | null, html: string | null): string {
  const raw = text ?? (html ? html.replace(/<[^>]+>/g, " ") : "");
  return raw.replace(/\s+/g, " ").replace(/^>+\s*/gm, "").trim().slice(0, 160);
}

export function InboxRow({ row }: { row: any }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isUnread = !row.readAt;
  return (
    <div
      data-inbox-row
      style={{
        display: "grid",
        gridTemplateColumns: "12px 1fr auto",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid var(--line)",
        background: isUnread ? "rgba(110,231,183,.03)" : undefined,
        alignItems: "start",
      }}
    >
      <div style={{ paddingTop: 6 }}>
        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: isUnread ? "var(--accent)" : "transparent" }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 2 }}>
          {row.slug ? (
            <Link href={`/prospects/${row.slug}#email-${row.id}`} className="link" data-row-link style={{ fontWeight: isUnread ? 600 : 500, fontSize: 14 }}>
              {row.business}
            </Link>
          ) : (
            <span className="muted" style={{ fontStyle: "italic" }}>unmatched · {row.fromAddr}</span>
          )}
          <span className="dim" style={{ fontSize: 12 }}>{row.fromAddr}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: isUnread ? 500 : 400, marginBottom: 4 }}>{row.subject || "(no subject)"}</div>
        <div className="dim" style={{ fontSize: 12, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {snippet(row.bodyText, row.bodyHtml)}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <span className="dim" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{relTime(row.sentAt ?? row.createdAt)}</span>
        <button
          type="button"
          className="ghost"
          data-row-read
          disabled={pending}
          style={{ fontSize: 10, padding: "2px 8px" }}
          onClick={() =>
            start(async () => {
              if (isUnread) await markEmailRead(row.id);
              else await markEmailUnread(row.id);
              router.refresh();
            })
          }
        >
          {isUnread ? "mark read" : "mark unread"}
        </button>
      </div>
    </div>
  );
}
