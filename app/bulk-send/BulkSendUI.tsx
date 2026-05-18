"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewBulkSend, executeBulkSend } from "./actions";

const STATUSES = ["lead", "researched", "mock_built", "emailed", "opened", "clicked", "replied", "meeting", "won", "lost", "ignored"] as const;

type Template = { id: number; name: string; scope: string; subject: string };

type PreviewResult = { count: number; previews: { slug: string; business: string; to: string | null; subject: string; body: string }[] };

export function BulkSendUI({ templates, regions, sectors, tags }: { templates: Template[]; regions: string[]; sectors: string[]; tags: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [templateId, setTemplateId] = useState<number | "">(templates[0]?.id ?? "");
  const [statuses, setStatuses] = useState<Set<string>>(new Set(["mock_built"]));
  const [region, setRegion] = useState<string>("");
  const [industry, setIndustry] = useState<string>("");
  const [tag, setTag] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; failed: { slug: string; error: string }[] } | null>(null);

  const toggleStatus = (s: string) => {
    setStatuses((cur) => {
      const next = new Set(cur);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
    setPreview(null);
  };

  const runPreview = () => {
    if (!templateId) return;
    start(async () => {
      setError(null); setResult(null);
      const r = await previewBulkSend({
        templateId: Number(templateId),
        statuses: Array.from(statuses),
        region: region || undefined,
        industry: industry || undefined,
        tag: tag || undefined,
      });
      if (!r.ok) { setError(r.error); return; }
      setPreview(r);
    });
  };

  const runSend = () => {
    if (!preview || preview.count === 0) return;
    if (typeof window !== "undefined" && !window.confirm(`Send to ${preview.count} prospects? This is real and cannot be undone.`)) return;
    start(async () => {
      setError(null); setResult(null);
      const r = await executeBulkSend({
        templateId: Number(templateId),
        statuses: Array.from(statuses),
        region: region || undefined,
        industry: industry || undefined,
        tag: tag || undefined,
      });
      if ("error" in r && !r.ok) { setError(r.error); return; }
      if (r.ok) {
        setResult({ sent: r.sent, failed: r.failed });
        setPreview(null);
        router.refresh();
      }
    });
  };

  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Template</div>
          <select value={templateId} onChange={(e) => { setTemplateId(Number(e.target.value)); setPreview(null); }} style={{ width: "100%" }}>
            {templates.length === 0 && <option value="">No templates — add some at /templates</option>}
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.scope}</option>)}
          </select>
        </div>

        <div>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Status (one or more)</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={`pill ${statuses.has(s) ? "active" : "slate"} clickable`}
                onClick={() => toggleStatus(s)}
              >
                {s.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Region</div>
          <select value={region} onChange={(e) => { setRegion(e.target.value); setPreview(null); }} style={{ width: "100%" }}>
            <option value="">any</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Sector</div>
          <select value={industry} onChange={(e) => { setIndustry(e.target.value); setPreview(null); }} style={{ width: "100%" }}>
            <option value="">any</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Tag</div>
          <select value={tag} onChange={(e) => { setTag(e.target.value); setPreview(null); }} style={{ width: "100%" }}>
            <option value="">any</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" className="primary" disabled={pending || !templateId} onClick={runPreview}>
          {pending && !result ? "matching…" : "preview matches"}
        </button>
        {preview && (
          <button type="button" disabled={pending || preview.count === 0} onClick={runSend} style={{ background: "#3a1717", borderColor: "#5a1f1f", color: "#fca5a5" }}>
            send to {preview.count}
          </button>
        )}
        {error && <span style={{ color: "var(--bad)", fontSize: 12 }}>{error}</span>}
      </div>

      {preview && (
        <div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            <strong style={{ color: preview.count > 0 ? "var(--accent)" : "var(--bad)" }}>{preview.count}</strong> prospect{preview.count === 1 ? "" : "s"} match.
            {preview.count > 0 && " First 3 rendered below:"}
          </div>
          {preview.previews.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
              {preview.previews.map((p, i) => (
                <div key={i} className="card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{p.business}</div>
                  <div className="dim" style={{ fontSize: 11 }}>{p.to}</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.subject}</div>
                  <div style={{ fontSize: 12, whiteSpace: "pre-wrap", color: "var(--sub)", maxHeight: 240, overflowY: "auto", padding: 6, background: "var(--bg)", borderRadius: 6 }}>
                    {p.body}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            ✓ Sent <span style={{ color: "var(--accent)" }}>{result.sent}</span>
            {result.failed.length > 0 && <> · <span style={{ color: "var(--bad)" }}>{result.failed.length} failed</span></>}
          </div>
          {result.failed.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary className="muted" style={{ fontSize: 11 }}>failures</summary>
              <ul style={{ fontSize: 11, color: "var(--bad)", marginTop: 6 }}>
                {result.failed.map((f) => <li key={f.slug}>{f.slug}: {f.error}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
