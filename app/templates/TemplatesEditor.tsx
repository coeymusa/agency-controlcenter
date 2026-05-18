"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTemplate, deleteTemplate, seedStarterTemplates } from "./actions";
import { VAR_KEYS } from "@/lib/templates";

type T = {
  id: number;
  name: string;
  scope: string;
  subject: string;
  body: string;
  updatedAt: string | Date;
};

const SCOPE_PILL: Record<string, string> = { cold: "blue", followup: "amber", breakup: "red", other: "slate" };

export function TemplatesEditor({ templates }: { templates: T[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Partial<T> | null>(null);

  if (templates.length === 0 && !editing) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="muted">No templates yet.</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button
            type="button"
            className="primary"
            disabled={pending}
            onClick={() => start(async () => { await seedStarterTemplates(); router.refresh(); })}
          >
            Seed 3 starter templates
          </button>
          <button type="button" onClick={() => setEditing({ name: "", scope: "other", subject: "", body: "" })}>
            + new from scratch
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14 }}>
      <div className="card" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{templates.length} template{templates.length === 1 ? "" : "s"}</div>
          <button type="button" className="ghost" style={{ fontSize: 11 }} onClick={() => setEditing({ name: "", scope: "other", subject: "", body: "" })}>+ new</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setEditing(t)}
              style={{
                background: editing && (editing as T).id === t.id ? "var(--accent-dim)" : "transparent",
                border: "none", borderRadius: 0, padding: "10px 12px",
                textAlign: "left", borderBottom: "1px solid var(--line)",
                cursor: "pointer", display: "flex", flexDirection: "column", gap: 4,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{t.name}</span>
                <span className={`pill ${SCOPE_PILL[t.scope] ?? "slate"}`}>{t.scope}</span>
              </div>
              <span className="dim" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject}</span>
            </button>
          ))}
        </div>
      </div>

      {editing && (
        <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 600 }}>{editing.id ? "Edit template" : "New template"}</div>
            <button type="button" className="ghost" onClick={() => setEditing(null)}>cancel</button>
          </div>
          <form
            action={(fd) => start(async () => {
              await saveTemplate({
                id: editing.id,
                name: String(fd.get("name") ?? "").trim(),
                scope: String(fd.get("scope") ?? "other"),
                subject: String(fd.get("subject") ?? ""),
                body: String(fd.get("body") ?? ""),
              });
              setEditing(null);
              router.refresh();
            })}
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8 }}>
              <input name="name" defaultValue={editing.name} placeholder="template name" required />
              <select name="scope" defaultValue={editing.scope ?? "other"}>
                <option value="cold">cold</option>
                <option value="followup">followup</option>
                <option value="breakup">breakup</option>
                <option value="other">other</option>
              </select>
            </div>
            <input name="subject" defaultValue={editing.subject} placeholder="subject (supports {{vars}})" required />
            <textarea name="body" defaultValue={editing.body} placeholder="body (supports {{vars}})" rows={14} style={{ fontSize: 13, fontFamily: "ui-sans-serif, system-ui, sans-serif" }} />
            <div className="dim" style={{ fontSize: 11, lineHeight: 1.6 }}>
              variables: {VAR_KEYS.map((k) => <code key={k} style={{ padding: "1px 5px", margin: "0 4px", border: "1px solid var(--line)", borderRadius: 4 }}>{`{{${k}}}`}</code>)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button type="submit" className="primary" disabled={pending}>{editing.id ? "save" : "create"}</button>
              {editing.id && (
                <button
                  type="button"
                  style={{ background: "#3a1717", borderColor: "#5a1f1f", color: "#fca5a5" }}
                  disabled={pending}
                  onClick={() => {
                    if (typeof window !== "undefined" && window.confirm("Delete this template?")) {
                      start(async () => { await deleteTemplate(editing.id!); setEditing(null); router.refresh(); });
                    }
                  }}
                >
                  delete
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
