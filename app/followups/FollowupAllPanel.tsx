"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewBulkSend, executeBulkSend } from "../bulk-send/actions";

type Template = { id: number; name: string; scope: string; subject: string };
type PreviewResult = { count: number; previews: { slug: string; business: string; to: string | null; subject: string; body: string }[] };

export function FollowupAllPanel({
  templates,
  slugs,
  queueLabel,
}: {
  templates: Template[];
  slugs: string[];
  queueLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showAllScopes, setShowAllScopes] = useState(false);

  const visibleTemplates = useMemo(() => {
    if (showAllScopes) return templates;
    const followups = templates.filter((t) => t.scope === "followup");
    return followups.length > 0 ? followups : templates;
  }, [templates, showAllScopes]);

  const [templateId, setTemplateId] = useState<number | "">(visibleTemplates[0]?.id ?? "");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; failed: { slug: string; error: string }[] } | null>(null);

  useEffect(() => {
    if (templateId && !visibleTemplates.find((t) => t.id === templateId)) {
      setTemplateId(visibleTemplates[0]?.id ?? "");
    }
  }, [visibleTemplates, templateId]);

  const eligible = slugs.length;

  const runPreview = () => {
    if (!templateId || eligible === 0) return;
    start(async () => {
      setError(null); setResult(null);
      const r = await previewBulkSend({ templateId: Number(templateId), slugs });
      if (!r.ok) { setError(r.error); return; }
      setPreview(r);
    });
  };

  const runSend = () => {
    if (!preview || preview.count === 0) return;
    const phrase = `send ${preview.count}`;
    if (typeof window !== "undefined") {
      const typed = window.prompt(
        `About to send a follow-up to ${preview.count} prospect${preview.count === 1 ? "" : "s"}.\nThis is real and cannot be undone.\n\nType "${phrase}" to confirm:`,
      );
      if (typed !== phrase) return;
    }
    start(async () => {
      setError(null); setResult(null);
      const r = await executeBulkSend({ templateId: Number(templateId), slugs });
      if ("error" in r && !r.ok) { setError(r.error); return; }
      if (r.ok) {
        setResult({ sent: r.sent, failed: r.failed });
        setPreview(null);
        router.refresh();
      }
    });
  };

  return (
    <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, borderColor: "#5a1f1f" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Follow up everyone in queue</div>
          <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
            Sends the chosen template to every prospect currently visible in the {queueLabel} list (no reply since last send, not snoozed).
          </div>
        </div>
        <div className="pill" style={{ background: "#3a1717", borderColor: "#5a1f1f", color: "#fca5a5", fontVariantNumeric: "tabular-nums" }}>{eligible}</div>
      </div>

      {templates.length === 0 ? (
        <div className="dim" style={{ fontSize: 12 }}>
          No templates yet. Add one at <a href="/templates" className="link">/templates</a>.
        </div>
      ) : eligible === 0 ? (
        <div className="dim" style={{ fontSize: 12 }}>Queue is empty. Nothing to follow up on.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "end" }}>
            <div>
              <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Template</div>
              <select
                value={templateId}
                onChange={(e) => { setTemplateId(Number(e.target.value)); setPreview(null); }}
                style={{ width: "100%" }}
              >
                {visibleTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} · {t.scope}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={`pill ${showAllScopes ? "active" : "slate"} clickable`}
              onClick={() => { setShowAllScopes((v) => !v); setPreview(null); }}
              title="Toggle to see templates outside the followup scope"
            >
              {showAllScopes ? "all scopes" : "followup only"}
            </button>
            <button type="button" className="primary" disabled={pending || !templateId} onClick={runPreview}>
              {pending && !result ? "matching…" : "preview"}
            </button>
          </div>

          {preview && (
            <div>
              <div style={{ fontSize: 12, marginBottom: 8 }}>
                <strong style={{ color: preview.count > 0 ? "var(--accent)" : "var(--bad)" }}>{preview.count}</strong> prospect{preview.count === 1 ? "" : "s"} will receive this.
                {preview.count > 0 && " First 3 rendered below."}
              </div>
              {preview.previews.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
                  {preview.previews.map((p, i) => (
                    <div key={i} className="card" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{p.business}</div>
                      <div className="dim" style={{ fontSize: 10 }}>{p.to}</div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{p.subject}</div>
                      <div style={{ fontSize: 11, whiteSpace: "pre-wrap", color: "var(--sub)", maxHeight: 200, overflowY: "auto", padding: 6, background: "var(--bg)", borderRadius: 6 }}>
                        {p.body}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  disabled={pending || preview.count === 0}
                  onClick={runSend}
                  style={{ background: "#3a1717", borderColor: "#5a1f1f", color: "#fca5a5" }}
                >
                  send follow-up to {preview.count}
                </button>
                <button type="button" className="ghost" onClick={() => setPreview(null)}>cancel</button>
              </div>
            </div>
          )}

          {error && <span style={{ color: "var(--bad)", fontSize: 12 }}>{error}</span>}

          {result && (
            <div className="card" style={{ padding: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                ✓ Sent <span style={{ color: "var(--accent)" }}>{result.sent}</span>
                {result.failed.length > 0 && <> · <span style={{ color: "var(--bad)" }}>{result.failed.length} failed</span></>}
              </div>
              {result.failed.length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary className="muted" style={{ fontSize: 11 }}>failures</summary>
                  <ul style={{ fontSize: 11, color: "var(--bad)", marginTop: 4 }}>
                    {result.failed.map((f) => <li key={f.slug}>{f.slug}: {f.error}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
