"use client";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { sendPitchEmail, saveDraft, clearDraft } from "./actions";
import { Thread } from "./Thread";
import { markProspectInboxRead } from "@/app/inbox/actions";
import { substitute, type Vars } from "@/lib/templates";

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

type Template = { id: number; name: string; scope: string; subject: string; body: string };

type Draft = { subject: string; body: string; fromAddr: string | null; toAddr: string | null; inReplyTo: string | null; updatedAt: string | Date } | null;

type Tracking = { opens: number; clicks: number; firstOpenAt: string | Date | null; lastOpenAt: string | Date | null; lastClickAt: string | Date | null };

export function ComposerArea({
  slug, defaultTo, defaultFrom, pitchUrl, business, emails, prospectId,
  templates, vars, initialDraft, tracking,
}: {
  slug: string; defaultTo: string; defaultFrom: string; pitchUrl: string | null;
  business: string; emails: Email[]; prospectId: number;
  templates: Template[]; vars: Vars; initialDraft: Draft;
  tracking?: Record<number, Tracking>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<boolean>(!!initialDraft);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Email | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(initialDraft ? new Date(initialDraft.updatedAt).getTime() : null);
  const [toAddr, setToAddr] = useState<string>(initialDraft?.toAddr ?? "");
  const [fromAddr, setFromAddr] = useState<string>(initialDraft?.fromAddr ?? "");

  // Mark inbound emails as read whenever the page mounts
  useEffect(() => {
    void markProspectInboxRead(prospectId);
  }, [prospectId]);

  const [subject, setSubject] = useState<string>(initialDraft?.subject ?? "");
  const [body, setBody] = useState<string>(initialDraft?.body ?? "");
  const [pickedTemplateId, setPickedTemplateId] = useState<number | null>(null);

  // Auto-save draft when subject or body changes (debounced 800ms)
  useEffect(() => {
    if (!open) return;
    if (replyTo) return; // skip drafts for replies (different convo each time)
    if (!subject && !body) return;
    const t = setTimeout(() => {
      void saveDraft(prospectId, {
        subject, body,
        fromAddr: fromAddr || null,
        toAddr: toAddr || null,
      }).then((r) => { if (r.ok) setDraftSavedAt(r.savedAt); });
    }, 800);
    return () => clearTimeout(t);
  }, [subject, body, fromAddr, toAddr, open, replyTo, prospectId]);

  const defaultSubject = replyTo
    ? (replyTo.subject.toLowerCase().startsWith("re:") ? replyTo.subject : "Re: " + replyTo.subject)
    : `Quick mock for ${business}`;
  const quotedBody = replyTo && replyTo.bodyText
    ? "\n\nOn " + new Date(replyTo.sentAt ?? replyTo.createdAt).toLocaleString() + ", " + (replyTo.fromAddr ?? "") + " wrote:\n" +
      replyTo.bodyText.split("\n").map((l) => "> " + l).join("\n")
    : "";
  const defaultBody = replyTo
    ? "\n" + quotedBody
    : (pitchUrl
        ? `Hi,\n\nI built a one-page redesign of your site — short loader, faster on mobile, clearer call-to-action.\n\nHave a look: ${pitchUrl}\n\nIf it's useful I can roll the live cutover in about a week. If not, no hard feelings.\n\nCorey`
        : `Hi,\n\nI'd like to show you a quick mock I built of your site. Let me know if you'd like me to send it over.\n\nCorey`);

  const applyTemplate = (t: Template | null) => {
    if (!t) { setPickedTemplateId(null); return; }
    setPickedTemplateId(t.id);
    setSubject(substitute(t.subject, vars));
    setBody(substitute(t.body, vars));
  };

  const onReply = (e: Email) => {
    setReplyTo(e);
    setOpen(true);
    setSubject(""); setBody(""); setPickedTemplateId(null);
    setError(null); setOkMsg(null);
    // Use the ref so the user sees the composer
    setTimeout(() => {
      const el = document.getElementById("composer-anchor");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Conversation ({emails.length})</span>
          {!open && <button type="button" className="primary" onClick={() => { setReplyTo(null); setSubject(""); setBody(""); setPickedTemplateId(null); setOpen(true); }}>📧 new email</button>}
        </div>
        <Thread emails={emails} onReply={onReply} tracking={tracking} />
      </div>

      <div id="composer-anchor" />
      {open && (
        <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 600 }}>{replyTo ? "Reply to " + (replyTo.fromAddr ?? business) : "Compose · " + business}</div>
            <button type="button" onClick={() => { setOpen(false); setReplyTo(null); setError(null); setOkMsg(null); }}>cancel</button>
          </div>
          <details style={{ fontSize: 11 }}>
            <summary className="muted" style={{ cursor: "pointer" }}>variables (click to expand)</summary>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", padding: "8px 4px", color: "var(--sub)" }}>
              {Object.entries({
                business: vars.business,
                contactName: vars.contactName,
                firstName: (vars.contactName ?? "").split(/\s+/)[0],
                contactEmail: vars.contactEmail,
                pitchUrl: vars.pitchUrl,
                location: vars.location,
                industry: vars.industry,
                signature: vars.signature ? vars.signature.slice(0, 40) + (vars.signature.length > 40 ? "…" : "") : null,
              }).map(([k, v]) => (
                <>
                  <code key={k} style={{ color: "var(--accent)" }}>{`{{${k}}}`}</code>
                  <span key={k + "-v"} className={v ? "" : "dim"}>{v || "—"}</span>
                </>
              ))}
            </div>
          </details>

          {templates.length > 0 && !replyTo && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 11 }}>template:</span>
              <button
                type="button"
                className={`pill ${pickedTemplateId === null ? "active" : "slate"} clickable`}
                onClick={() => applyTemplate(null)}
              >
                blank
              </button>
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`pill ${pickedTemplateId === t.id ? "active" : "slate"} clickable`}
                  onClick={() => applyTemplate(t)}
                  title={t.subject}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}

          <form
            action={(fd) => start(async () => {
              setError(null); setOkMsg(null);
              const r = await sendPitchEmail(slug, {
                to: String(fd.get("to") ?? ""),
                from: String(fd.get("from") ?? "") || undefined,
                subject: String(fd.get("subject") ?? ""),
                body: String(fd.get("body") ?? ""),
                inReplyToInternetMessageId: replyTo?.internetMessageId ?? undefined,
              });
              if ("ok" in r && r.ok) {
                setOkMsg(`sent ✓ (email #${r.emailId})`);
                if (!replyTo) await clearDraft(prospectId);
                setOpen(false); setReplyTo(null); setSubject(""); setBody(""); setDraftSavedAt(null);
                router.refresh();
              } else if ("error" in r) {
                setError(r.error);
              }
            })}
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 6, alignItems: "center", fontSize: 12 }}>
              <span className="muted">From</span>
              <input name="from" value={fromAddr || defaultFrom} onChange={(e) => setFromAddr(e.target.value)} placeholder="defaults to RESEND_FROM" />
              <span className="muted">To</span>
              <input name="to" value={toAddr || replyTo?.fromAddr || defaultTo} onChange={(e) => setToAddr(e.target.value)} required />
              <span className="muted">Subject</span>
              <input name="subject" value={subject || defaultSubject} onChange={(e) => setSubject(e.target.value)} required />
            </div>
            {showPreview ? (
              <PreviewPane subject={subject || defaultSubject} body={body || defaultBody} />
            ) : (
              <textarea name="body" rows={12} value={body || defaultBody} onChange={(e) => setBody(e.target.value)} style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", fontSize: 13 }} />
            )}
            <div className="muted" style={{ fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span>
                Every link rewritten as tracked short-link · 1×1 pixel auto-appended
                {replyTo && <> · reply (<code>{(replyTo.internetMessageId ?? "n/a").slice(0, 30)}</code>)</>}
              </span>
              {draftSavedAt && !replyTo && <span className="dim">draft saved {Math.max(1, Math.floor((Date.now() - draftSavedAt) / 1000))}s ago</span>}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="submit" className="primary" disabled={pending}>
                {pending ? "sending…" : (replyTo ? "send reply" : "send via Resend")}
              </button>
              <button type="button" className="ghost" onClick={() => setShowPreview((v) => !v)}>
                {showPreview ? "edit" : "preview"}
              </button>
              {!replyTo && draftSavedAt && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => start(async () => { await clearDraft(prospectId); setSubject(""); setBody(""); setDraftSavedAt(null); router.refresh(); })}
                  style={{ fontSize: 11 }}
                >
                  discard draft
                </button>
              )}
              {error && <span style={{ color: "var(--bad)", fontSize: 12 }}>{error}</span>}
              {okMsg && <span style={{ color: "var(--accent)", fontSize: 12 }}>{okMsg}</span>}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

function PreviewPane({ subject, body }: { subject: string; body: string }) {
  // Construct what the email will roughly look like — show URLs with a tracked-link
  // pseudo-prefix to make it obvious they're being rewritten.
  const safe = body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const linked = safe.split(/\n{2,}/).map((para) =>
    `<p style="margin:0 0 12px">${para.replace(/\n/g, "<br>").replace(URL_RE, (u) => `<a href="${u}" style="color:#93c5fd;text-decoration:underline">${u}</a> <span style="font-size:10px;color:#fbbf24">[tracked]</span>`)}</p>`,
  ).join("\n");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="muted" style={{ fontSize: 11 }}>preview · what the recipient sees (URLs become tracked /t/c/&lt;code&gt; on send)</div>
      <div className="card" style={{ padding: 16, background: "#ffffff", color: "#111", borderColor: "var(--line)", minHeight: 200 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10, color: "#111" }}>{subject || "(no subject)"}</div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: "#222" }} dangerouslySetInnerHTML={{ __html: linked }} />
        <div style={{ marginTop: 14, fontSize: 10, color: "#fbbf24" }}>● 1×1 tracking pixel appended here</div>
      </div>
    </div>
  );
}
