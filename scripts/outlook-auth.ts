#!/usr/bin/env tsx
/**
 * Microsoft Graph (Outlook) device-code OAuth helper.
 *
 * One-time Azure setup:
 *   1. https://portal.azure.com → Entra ID → App registrations → New registration
 *      - Name: agency-control-center
 *      - Supported accounts: "Personal Microsoft accounts only" (for outlook.com / hotmail)
 *        OR "Accounts in any organisational directory + personal Microsoft accounts"
 *      - Redirect URI: leave blank
 *   2. After creation, copy the Application (client) ID
 *   3. Authentication → Advanced settings → "Allow public client flows" → Yes → Save
 *   4. API permissions → Add → Microsoft Graph → Delegated permissions:
 *        - Mail.Read
 *        - Mail.Send       (optional, only needed if you also send via the script)
 *        - offline_access
 *      → Grant admin consent (or sign in once and approve as user)
 *   5. Put the client ID into .env as OUTLOOK_CLIENT_ID
 *   6. Run: pnpm outlook:auth   →  paste the resulting refresh_token into OUTLOOK_REFRESH_TOKEN
 *
 * If your account is a personal Microsoft account (outlook.com, hotmail.com, live.com), use
 * the "consumers" tenant. Otherwise "common" works for both.
 */
import "dotenv/config";

const TENANT = process.env.OUTLOOK_TENANT ?? "common";
const SCOPES = "offline_access Mail.Read Mail.Send";

async function main() {
  const clientId = process.env.OUTLOOK_CLIENT_ID;
  if (!clientId) {
    console.error("Set OUTLOOK_CLIENT_ID in .env first.");
    process.exit(1);
  }

  const dc = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/devicecode`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, scope: SCOPES }),
  });
  if (!dc.ok) {
    console.error("devicecode request failed:", await dc.text());
    process.exit(1);
  }
  const device = (await dc.json()) as {
    user_code: string;
    device_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  };

  console.log("\nOpen this URL and enter the code below:\n");
  console.log("  URL : " + device.verification_uri);
  console.log("  Code: " + device.user_code + "\n");
  console.log("Waiting (up to " + Math.round(device.expires_in / 60) + " minutes)…");

  const deadline = Date.now() + device.expires_in * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, (device.interval || 5) * 1000));
    const tok = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: clientId,
        device_code: device.device_code,
      }),
    });
    const body = (await tok.json()) as any;
    if (tok.ok && body.refresh_token) {
      console.log("\n✓ Authorised. Save this to .env:\n");
      console.log("OUTLOOK_REFRESH_TOKEN=" + body.refresh_token);
      if (body.id_token) {
        // id_token is a JWT; decoding the middle segment is enough to grab the email.
        try {
          const claims = JSON.parse(Buffer.from(body.id_token.split(".")[1], "base64").toString("utf8"));
          if (claims.email || claims.preferred_username) {
            console.log("OUTLOOK_USER=" + (claims.email ?? claims.preferred_username));
          }
        } catch {/* ignore */}
      }
      return;
    }
    if (body.error === "authorization_pending") continue;
    if (body.error === "slow_down") {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    console.error("\n✗ " + body.error + ": " + body.error_description);
    process.exit(1);
  }
  console.error("\n✗ Timed out waiting for authorisation");
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
