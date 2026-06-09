"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkSendReady, previewBulkSends, type BulkPreviewRow } from "./actions";

type Props = {
  slugs: string[];
  scope?: "cold" | "followup";
};

export function BulkSendButton({ slugs, scope = "cold" }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [previewing, setPreviewing] = useState(false);
  const [previewRows, setPreviewRows] = useState<BulkPreviewRow[] | null>(null);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<string | null>(null);

  if (slugs.length === 0) return null;
  const verb = scope === "followup" ? "follow-up" : "pitch";

  function openPreview() {
    setPreviewing(true);
    setProgress(null);
    start(async () => {
      const r = await previewBulkSends(slugs, scope);
      setPreviewRows(r.rows);
      setTemplateName(r.templateName);
    });
  }

  function closePreview() {
    setPreviewing(false);
    setPreviewRows(null);
    setExpanded(new Set());
  }

  function toggle(slug: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  }

  function fire() {
    const sendable = (previewRows ?? []).filter((r) => !r.blocker).map((r) => r.slug);
    if (sendable.length === 0) {
      setProgress("nothing sendable");
      return;
    }
    start(async () => {
      setProgress(`sending ${sendable.length}…`);
      const r = await bulkSendReady(sendable, scope);
      if (r.failed.length === 0) {
        setProgress(`✓ sent ${r.sent}`);
        setTimeout(() => {
          closePreview();
          router.refresh();
        }, 900);
      } else {
        const firstErr = r.failed[0];
        setProgress(`sent ${r.sent}/${sendable.length} · ${r.failed.length} failed (${firstErr.slug}: ${firstErr.error.slice(0, 40)})`);
        setTimeout(() => router.refresh(), 2500);
      }
    });
  }

  const sendableCount = (previewRows ?? []).filter((r) => !r.blocker).length;
  const blockedCount = (previewRows ?? []).length - sendableCount;

  return (
    <>
      <button
        type="button"
        className="primary"
        disabled={pending}
        style={{ fontSize: 12, padding: "6px 12px" }}
        onClick={openPreview}
      >
        📤 send all {slugs.length}
      </button>

      {previewing && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !pending) closePreview(); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div style={{
            background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10,
            maxWidth: 900, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column",
            boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          }}>
            {/* Header */}
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>Preview before sending</div>
                <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
                  {!previewRows ? "loading…" : (
                    <>
                      template: <strong>{templateName ?? "(none)"}</strong> · {sendableCount} sendable
                      {blockedCount > 0 && <> · <span style={{ color: "var(--warn)" }}>{blockedCount} blocked</span></>}
                    </>
                  )}
                </div>
              </div>
              <button type="button" className="ghost" onClick={closePreview} disabled={pending} style={{ fontSize: 12, padding: "5px 10px" }}>close</button>
            </div>

            {/* Body — scrollable list of previews */}
            <div style={{ overflow: "auto", flex: 1, padding: 12 }}>
              {!previewRows && <div className="muted" style={{ padding: 12, fontSize: 13 }}>Loading previews…</div>}
              {previewRows && previewRows.length === 0 && <div className="muted" style={{ padding: 12, fontSize: 13 }}>No prospects to preview.</div>}
              {previewRows?.map((r) => {
                const isOpen = expanded.has(r.slug);
                return (
                  <div key={r.slug} style={{
                    border: "1px solid var(--line)", borderRadius: 8, marginBottom: 8,
                    background: r.blocker ? "rgba(251,191,36,.04)" : "transparent",
                    opacity: r.blocker ? 0.7 : 1,
                  }}>
                    <button
                      type="button"
                      onClick={() => toggle(r.slug)}
                      style={{
                        width: "100%", textAlign: "left", padding: "10px 14px", cursor: "pointer",
                        background: "transparent", border: "none", color: "var(--ink)",
                        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{r.business}</div>
                        <div className="dim" style={{ fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.contactEmail ?? "(no email)"} · {r.subject || "(no subject)"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                        {r.blocker && <span className="pill amber" style={{ fontSize: 10 }}>blocked: {r.blocker}</span>}
                        <span className="dim" style={{ fontSize: 11 }}>{isOpen ? "▾" : "▸"}</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                        <div style={{ fontSize: 11, color: "var(--sub)", marginBottom: 6 }}>SUBJECT</div>
                        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>{r.subject || <span className="muted">(empty)</span>}</div>
                        <div style={{ fontSize: 11, color: "var(--sub)", marginBottom: 6 }}>BODY</div>
                        <pre style={{
                          fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
                          padding: 10, background: "var(--bg-soft, rgba(255,255,255,0.02))", border: "1px solid var(--line)",
                          borderRadius: 6, margin: 0, fontFamily: "inherit",
                        }}>{r.body || "(empty)"}</pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 11, color: progress?.startsWith("✓") ? "var(--accent)" : progress?.includes("failed") ? "var(--bad)" : "var(--sub)", flex: 1 }}>
                {progress ?? "Confirm before this fires through Resend — sends can't be undone."}
              </div>
              <button type="button" className="ghost" onClick={closePreview} disabled={pending} style={{ fontSize: 12, padding: "6px 12px" }}>cancel</button>
              <button
                type="button"
                className="primary"
                onClick={fire}
                disabled={pending || !previewRows || sendableCount === 0}
                style={{ fontSize: 12, padding: "6px 14px" }}
              >
                {pending ? "sending…" : `📤 fire ${sendableCount} ${verb}${sendableCount === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
