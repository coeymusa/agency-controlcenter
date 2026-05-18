"use client";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  startOutlookConnect,
  pollOutlookConnect,
  disconnectOutlook,
} from "./actions";

type Started = { url: string; code: string };

export function OutlookConnect({ connected, clientIdSet }: { connected: boolean; clientIdSet: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [started, setStarted] = useState<Started | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // While `started` is non-null and `polling` is true, keep polling.
  useEffect(() => {
    if (!started || !polling) return;
    let stopped = false;
    const tick = async () => {
      while (!stopped) {
        await new Promise((r) => setTimeout(r, 3000));
        if (stopped) break;
        const r = await pollOutlookConnect();
        if (!r.ok) {
          setError(r.error);
          setPolling(false);
          setStarted(null);
          return;
        }
        if (!r.pending) {
          setStatusMsg("connected as " + (r.user ?? "your account") + " — refreshing…");
          setPolling(false);
          setStarted(null);
          router.refresh();
          return;
        }
      }
    };
    void tick();
    return () => { stopped = true; };
  }, [started, polling, router]);

  if (connected) {
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await disconnectOutlook(); router.refresh(); })}
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
        Set <code>OUTLOOK_CLIENT_ID</code> below first, save, then come back to connect.
      </div>
    );
  }

  if (started) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13 }}>
          1. Open <a className="link" href={started.url} target="_blank" rel="noreferrer">{started.url}</a>
        </div>
        <div style={{ fontSize: 13 }}>
          2. Enter this code: <code style={{ fontSize: 18, padding: "4px 10px", background: "#1f1f24", borderRadius: 6, letterSpacing: ".15em" }}>{started.code}</code>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          {polling ? "Waiting for you to authorise… (polling every 3s)" : "Click below when you've authorised."}
        </div>
        {!polling && (
          <button type="button" className="primary" onClick={() => setPolling(true)}>I've authorised — check now</button>
        )}
        <button type="button" onClick={() => { setStarted(null); setPolling(false); setStatusMsg(null); setError(null); }}>cancel</button>
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
          const r = await startOutlookConnect();
          if (!r.ok) { setError(r.error); return; }
          setStarted({ url: r.url, code: r.code });
          setPolling(true);
        })}
      >
        Connect Outlook
      </button>
      {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}
      {statusMsg && <div style={{ color: "#6ee7b7", fontSize: 12 }}>{statusMsg}</div>}
    </div>
  );
}
