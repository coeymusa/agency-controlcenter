"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getGmailAuthUrl, disconnectGmail } from "./actions";

export function GmailConnect({ connected, clientIdSet }: { connected: boolean; clientIdSet: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (connected) {
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await disconnectGmail(); router.refresh(); })}
          style={{ background: "#3a1717", borderColor: "#5a1f1f", color: "#fca5a5" }}
        >
          disconnect
        </button>
        <span className="muted" style={{ fontSize: 12 }}>token stored — sync runs automatically</span>
      </div>
    );
  }

  if (!clientIdSet) {
    return (
      <div className="muted" style={{ fontSize: 13 }}>
        Set <code>GMAIL_CLIENT_ID</code> + <code>GMAIL_CLIENT_SECRET</code> below first, save, then come back.
        <br />
        Also register <code>{typeof window !== "undefined" ? window.location.origin : ""}/api/gmail/callback</code> as an authorised redirect URI in Google Cloud Console.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        className="primary"
        disabled={pending}
        onClick={() => start(async () => {
          setError(null);
          const origin = window.location.origin;
          const r = await getGmailAuthUrl(origin);
          if (!r.ok) { setError(r.error); return; }
          window.location.href = r.url;
        })}
      >
        Connect Gmail
      </button>
      <div className="muted" style={{ fontSize: 11 }}>
        Make sure <code>{typeof window !== "undefined" ? window.location.origin : ""}/api/gmail/callback</code> is registered as an authorised redirect URI.
      </div>
      {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}
    </div>
  );
}
