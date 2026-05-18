"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendPitchEmail } from "./actions";

export function Composer({ slug, defaultTo, defaultFrom, pitchUrl, business }: { slug: string; defaultTo: string; defaultFrom: string; pitchUrl: string | null; business: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const defaultSubject = `Quick mock for ${business}`;
  const defaultBody = pitchUrl
    ? `Hi,\n\nI built a one-page redesign of your site — short loader, faster on mobile, clearer call-to-action.\n\nHave a look: ${pitchUrl}\n\nIf it's useful I can roll the live cutover in about a week. If not, no hard feelings.\n\nCorey`
    : `Hi,\n\nI'd like to show you a quick mock I built of your site. Let me know if you'd like me to send it over.\n\nCorey`;

  if (!open) {
    return (
      <button type="button" className="primary" onClick={() => setOpen(true)}>
        📧 compose pitch email
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600 }}>Compose pitch · {business}</div>
        <button type="button" onClick={() => { setOpen(false); setError(null); setOkMsg(null); }}>cancel</button>
      </div>
      <form
        action={(fd) => start(async () => {
          setError(null); setOkMsg(null);
          const r = await sendPitchEmail(slug, {
            to: String(fd.get("to") ?? ""),
            from: String(fd.get("from") ?? "") || undefined,
            subject: String(fd.get("subject") ?? ""),
            body: String(fd.get("body") ?? ""),
          });
          if ("ok" in r && r.ok) {
            setOkMsg(`sent ✓ (email #${r.emailId})`);
            setOpen(false);
            router.refresh();
          } else if ("error" in r) {
            setError(r.error);
          }
        })}
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 6, alignItems: "center", fontSize: 12 }}>
          <span className="muted">From</span>
          <input name="from" defaultValue={defaultFrom} placeholder="defaults to RESEND_FROM" />
          <span className="muted">To</span>
          <input name="to" defaultValue={defaultTo} required />
          <span className="muted">Subject</span>
          <input name="subject" defaultValue={defaultSubject} required />
        </div>
        <textarea name="body" rows={12} defaultValue={defaultBody} style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", fontSize: 13 }} />
        <div className="muted" style={{ fontSize: 11 }}>
          Every link in the body gets rewritten to a tracked short-link. A 1×1 tracking pixel is appended automatically.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="submit" className="primary" disabled={pending}>
            {pending ? "sending…" : "send via Resend"}
          </button>
          {error && <span style={{ color: "var(--bad)", fontSize: 12 }}>{error}</span>}
          {okMsg && <span style={{ color: "var(--accent)", fontSize: 12 }}>{okMsg}</span>}
        </div>
      </form>
    </div>
  );
}
