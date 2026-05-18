"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  id: number;
  subject: string;
  fromAddr: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  sentAt: Date | string | null;
  createdAt: Date | string;
  slug: string | null;
  business: string | null;
};

export function QuickLook({ rows }: { rows: Row[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const row = rows.find((r) => r.id === openId) ?? null;

  // Listen for the global quick-look event dispatched from InboxRow's eye button
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ id: number }>).detail;
      if (detail?.id) setOpenId(detail.id);
    }
    window.addEventListener("inbox-quicklook", handler);
    return () => window.removeEventListener("inbox-quicklook", handler);
  }, []);

  useEffect(() => {
    if (openId === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  if (!row) return null;

  const body = row.bodyText
    ?? (row.bodyHtml ? row.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");

  return (
    <div
      onClick={() => setOpenId(null)}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ maxWidth: 720, width: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column" }}
      >
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{row.subject || "(no subject)"}</div>
            <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
              From <strong>{row.fromAddr}</strong>{row.business && <> · {row.business}</>} · {new Date(row.sentAt ?? row.createdAt).toLocaleString()}
            </div>
          </div>
          <button type="button" className="ghost" onClick={() => setOpenId(null)}>✕</button>
        </div>
        <div style={{ padding: "16px 18px", overflowY: "auto", flex: 1, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "var(--ink)" }}>
          {body || <span className="dim">(empty body)</span>}
        </div>
        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
          <div className="dim" style={{ fontSize: 11 }}>press <span className="kbd">Esc</span> to close</div>
          {row.slug && (
            <Link href={`/prospects/${row.slug}#email-${row.id}`} className="link" style={{ fontSize: 12 }}>
              open thread →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
