import { Fragment } from "react";
import { listSettings, maskSecret } from "@/lib/settings";
import { saveSettings } from "./actions";
import { OutlookConnect } from "./OutlookConnect";
import { GmailConnect } from "./GmailConnect";

export const dynamic = "force-dynamic";

const GROUPS: { title: string; keys: string[]; help?: string }[] = [
  {
    title: "Outlook (Microsoft Graph)",
    keys: ["OUTLOOK_TENANT", "OUTLOOK_CLIENT_ID", "OUTLOOK_USER", "OUTLOOK_REFRESH_TOKEN"],
    help: "Tenant: 'common' (works for personal + work) or 'consumers' (personal only). Client ID comes from your Entra app registration. Refresh token is set automatically by Connect Outlook below.",
  },
  {
    title: "Gmail",
    keys: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_USER", "GMAIL_REFRESH_TOKEN"],
    help: "Set OAuth client id + secret from Google Cloud Console → register /api/gmail/callback as a redirect URI → then click Connect Gmail above.",
  },
  {
    title: "Outbound defaults",
    keys: ["DEFAULT_FROM_NAME", "DEFAULT_FROM_ADDRESS", "DEFAULT_SIGNATURE"],
    help: "Used when generating email drafts so you don't repeat yourself.",
  },
  {
    title: "Hosting",
    keys: ["PUBLIC_BASE_URL"],
    help: "Your deployed URL — e.g. https://control.yourdomain.com. The tracking pixel + click URLs use this; for local dev leave blank and the request host is used.",
  },
];

export default async function Settings() {
  const settings = await listSettings();
  const byKey = Object.fromEntries(settings.map((s) => [s.key, s]));
  const outlookConnected = !!byKey["OUTLOOK_REFRESH_TOKEN"]?.value;
  const gmailConnected = !!byKey["GMAIL_REFRESH_TOKEN"]?.value;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600 }}>Outlook</div>
            <div className="muted" style={{ fontSize: 12 }}>{byKey["OUTLOOK_USER"]?.value ?? "no account linked"}</div>
          </div>
          <span className={`pill ${outlookConnected ? "green" : "amber"}`}>
            {outlookConnected ? "connected" : "not connected"}
          </span>
        </div>
        <div style={{ marginTop: 12 }}><OutlookConnect connected={outlookConnected} clientIdSet={!!byKey["OUTLOOK_CLIENT_ID"]?.value} /></div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600 }}>Gmail</div>
            <div className="muted" style={{ fontSize: 12 }}>{byKey["GMAIL_USER"]?.value ?? "no account linked"}</div>
          </div>
          <span className={`pill ${gmailConnected ? "green" : "amber"}`}>
            {gmailConnected ? "connected" : "not connected"}
          </span>
        </div>
        <div style={{ marginTop: 12 }}>
          <GmailConnect
            connected={gmailConnected}
            clientIdSet={!!byKey["GMAIL_CLIENT_ID"]?.value && !!byKey["GMAIL_CLIENT_SECRET"]?.value}
          />
        </div>
      </div>

      <form action={saveSettings} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 18 }}>
        {GROUPS.map((g) => (
          <div key={g.title} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{g.title}</div>
              {g.help && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{g.help}</div>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 80px", rowGap: 8, columnGap: 12, alignItems: "center" }}>
              {g.keys.map((k) => {
                const row = byKey[k];
                if (!row) return null;
                const placeholder = row.fromEnv ? "(from .env: " + maskSecret(row.value) + ")" : "";
                if (k === "DEFAULT_SIGNATURE") {
                  return (
                    <Fragment key={k}>
                      <label style={{ fontSize: 12 }} className="muted">{k}</label>
                      <textarea
                        name={k}
                        rows={3}
                        defaultValue={row.value && !row.fromEnv ? row.value : ""}
                        placeholder={placeholder}
                        style={{ gridColumn: "span 2" }}
                      />
                    </Fragment>
                  );
                }
                return (
                  <Fragment key={k}>
                    <label style={{ fontSize: 12 }} className="muted">{k}</label>
                    <input
                      name={k}
                      type={row.isSecret ? "password" : "text"}
                      defaultValue={row.value && !row.fromEnv ? row.value : ""}
                      placeholder={placeholder}
                    />
                    <span className={`pill ${row.value ? "green" : "slate"}`} style={{ justifySelf: "start" }}>
                      {row.value ? (row.fromEnv ? "env" : "saved") : "—"}
                    </span>
                  </Fragment>
                );
              })}
            </div>
          </div>
        ))}
        <div>
          <button type="submit" className="primary">save</button>
        </div>
      </form>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Quick reference</div>
        <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", color: "#9b9ba3" }}>{`# add or update a prospect
pnpm cc prospect "Acorn Kitchens" --slug acorn-kitchens \\
  --email info@acornkitchens.co.uk --location "Cardiff" --industry "Kitchens" \\
  --status mock_built --pitch https://acorn-kitchens.vercel.app

# log a sent email (returns the tracking pixel URL + tracked link URLs)
pnpm cc email acorn-kitchens \\
  --subject "Quick mock for Acorn Kitchens" \\
  --to info@acornkitchens.co.uk --from $DEFAULT_FROM_ADDRESS \\
  --link https://acorn-kitchens.vercel.app \\
  --outlook-conv-id <conversationId from Outlook>

pnpm cc note acorn-kitchens --text "Phoned 3pm — answerphone"
pnpm cc status acorn-kitchens replied
pnpm cc tag acorn-kitchens follow-up urgent`}</pre>
      </div>
    </div>
  );
}
