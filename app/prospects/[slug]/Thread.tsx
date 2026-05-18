"use client";
import { useEffect, useState } from "react";

type Email = {
  id: number;
  direction: "outbound" | "inbound";
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  fromAddr: string | null;
  toAddr: string | null;
  sentAt: Date | string | null;
  createdAt: Date | string;
  readAt: Date | string | null;
  internetMessageId: string | null;
  resendMessageId: string | null;
};

type Tracking = {
  opens: number;
  clicks: number;
  firstOpenAt: string | Date | null;
  lastOpenAt: string | Date | null;
  lastClickAt: string | Date | null;
};

function relPast(t: Date | string | null): string {
  if (!t) return "";
  const d = t instanceof Date ? t : new Date(t);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 86400 * 7) return Math.floor(s / 86400) + "d ago";
  return d.toLocaleDateString();
}

function fmt(t: Date | string | null): string {
  if (!t) return "—";
  const d = t instanceof Date ? t : new Date(t);
  return d.toLocaleString();
}

function collapseQuoted(text: string): { visible: string; quoted: string | null } {
  // Split at the first quoted block: lines starting with > or "On ... wrote:" preamble.
  const lines = text.split("\n");
  let cut = -1;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (/^>+/.test(ln)) { cut = i; break; }
    if (/^on .* wrote:$/i.test(ln)) { cut = i; break; }
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(ln)) { cut = i; break; }
  }
  if (cut === -1) return { visible: text, quoted: null };
  // Trim trailing blank lines from visible
  while (cut > 0 && lines[cut - 1].trim() === "") cut--;
  return { visible: lines.slice(0, cut).join("\n").trimEnd(), quoted: lines.slice(cut).join("\n") };
}

function timeSince(sent: Date | string | null, fired: Date | string | null): string {
  if (!sent || !fired) return "";
  const s = new Date(sent).getTime();
  const f = new Date(fired).getTime();
  const diff = Math.max(0, Math.round((f - s) / 1000));
  if (diff < 60) return diff + "s";
  if (diff < 3600) return Math.round(diff / 60) + "m";
  if (diff < 86400) return Math.round(diff / 3600) + "h";
  return Math.round(diff / 86400) + "d";
}

function Bubble({ e, onReply, onForward, tracking }: { e: Email; onReply: (e: Email) => void; onForward: (e: Email) => void; tracking?: Tracking }) {
  const isOut = e.direction === "outbound";
  const text = e.bodyText ?? (e.bodyHtml ? "[HTML body]" : "");
  const { visible, quoted } = collapseQuoted(text);
  const [showQuoted, setShowQuoted] = useState(false);

  return (
    <div id={`email-${e.id}`} style={{ display: "flex", justifyContent: isOut ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "78%",
          background: isOut ? "rgba(110,231,183,.08)" : "var(--panel-2)",
          border: "1px solid " + (isOut ? "rgba(110,231,183,.25)" : "var(--line)"),
          borderRadius: 12,
          padding: "12px 14px",
          display: "flex", flexDirection: "column", gap: 6,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontSize: 11, color: "var(--sub)" }}>
            <strong style={{ color: "var(--ink)" }}>{isOut ? "You" : (e.fromAddr ?? "Unknown")}</strong>
            {isOut && e.toAddr && <> → {e.toAddr}</>}
          </span>
          <span className="dim" style={{ fontSize: 10, whiteSpace: "nowrap" }}>{fmt(e.sentAt ?? e.createdAt)}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{e.subject}</div>
        <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.55, color: "var(--ink)" }}>{visible || <span className="dim">(empty)</span>}</div>
        {quoted && (
          <div>
            <button
              type="button"
              onClick={() => setShowQuoted((v) => !v)}
              className="ghost"
              style={{ fontSize: 11, padding: "2px 6px" }}
            >
              {showQuoted ? "hide quoted" : "show quoted"}
            </button>
            {showQuoted && (
              <pre style={{ fontSize: 11, marginTop: 6, padding: 8, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 6, whiteSpace: "pre-wrap", color: "var(--sub)" }}>
                {quoted}
              </pre>
            )}
          </div>
        )}
        {isOut && tracking && (tracking.opens > 0 || tracking.clicks > 0) && (
          <div style={{ fontSize: 11, color: "var(--sub)", display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 6, borderTop: "1px solid var(--line)" }}>
            <span style={{ color: tracking.opens > 0 ? "var(--warn)" : "var(--dim)" }} title={tracking.lastOpenAt ? "last open " + relPast(tracking.lastOpenAt) : ""}>
              👁 {tracking.opens} open{tracking.opens === 1 ? "" : "s"}
              {tracking.firstOpenAt && <> · first opened {timeSince(e.sentAt, tracking.firstOpenAt)} after send</>}
            </span>
            <span style={{ color: tracking.clicks > 0 ? "var(--warn)" : "var(--dim)" }} title={tracking.lastClickAt ? "last click " + relPast(tracking.lastClickAt) : ""}>
              ↗ {tracking.clicks} click{tracking.clicks === 1 ? "" : "s"}
              {tracking.lastClickAt && <> · {relPast(tracking.lastClickAt)}</>}
            </span>
          </div>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          {!isOut && (
            <button type="button" className="ghost" style={{ fontSize: 11 }} onClick={() => onReply(e)}>↩ Reply</button>
          )}
          <button type="button" className="ghost" style={{ fontSize: 11 }} onClick={() => onForward(e)}>→ Forward</button>
        </div>
      </div>
    </div>
  );
}

export function Thread({ emails, onReply, onForward, tracking }: { emails: Email[]; onReply: (e: Email) => void; onForward: (e: Email) => void; tracking?: Record<number, Tracking> }) {
  // Scroll the deep-linked email into view if a fragment is present
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.location.hash.match(/^#email-(\d+)$/);
    if (!m) return;
    const el = document.getElementById("email-" + m[1]);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.boxShadow = "0 0 0 2px var(--accent)";
      setTimeout(() => { el.style.boxShadow = ""; }, 1600);
    }
  }, []);

  if (emails.length === 0) {
    return <div className="dim" style={{ padding: 18, textAlign: "center" }}>no emails yet</div>;
  }
  // Oldest first reads more naturally as a conversation
  const ordered = [...emails].sort((a, b) => {
    const ta = new Date(a.sentAt ?? a.createdAt).getTime();
    const tb = new Date(b.sentAt ?? b.createdAt).getTime();
    return ta - tb;
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14 }}>
      {ordered.map((e) => <Bubble key={e.id} e={e} onReply={onReply} onForward={onForward} tracking={tracking?.[e.id]} />)}
    </div>
  );
}
