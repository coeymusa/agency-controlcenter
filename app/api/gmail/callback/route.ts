import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getSetting, setSetting } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function htmlResponse(body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Gmail connect</title>
<style>body{font:14px ui-sans-serif,system-ui;background:#0a0a0b;color:#e8e8ea;padding:60px;text-align:center}</style></head>
<body>${body}<script>setTimeout(()=>{window.location='/settings'},2500)</script></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (err) return htmlResponse(`<h2>✗ ${err}</h2><p>Redirecting back…</p>`, 400);
  if (!code) return htmlResponse(`<h2>✗ Missing code</h2>`, 400);

  const cid = await getSetting("GMAIL_CLIENT_ID");
  const cs = await getSetting("GMAIL_CLIENT_SECRET");
  if (!cid || !cs) return htmlResponse(`<h2>✗ GMAIL_CLIENT_ID/SECRET not set</h2>`, 400);

  const redirectUri = url.origin + "/api/gmail/callback";
  const oauth2 = new google.auth.OAuth2(cid, cs, redirectUri);

  try {
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      return htmlResponse(
        `<h2>⚠ No refresh_token returned</h2>
<p>Revoke previous access at <a style="color:#93c5fd" href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a> and try again.</p>`,
        400,
      );
    }
    await setSetting("GMAIL_REFRESH_TOKEN", tokens.refresh_token);

    // Fetch the user's email so we can identify outbound vs inbound in sync.
    try {
      oauth2.setCredentials(tokens);
      const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
      const info = await oauth2Api.userinfo.get();
      if (info.data.email) await setSetting("GMAIL_USER", info.data.email);
    } catch {/* not fatal */}

    return htmlResponse(`<h2>✓ Gmail connected</h2><p>Redirecting back…</p>`);
  } catch (e) {
    return htmlResponse(`<h2>✗ ${String(e).slice(0, 300)}</h2>`, 400);
  }
}
