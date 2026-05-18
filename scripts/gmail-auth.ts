#!/usr/bin/env tsx
/**
 * One-time Gmail OAuth helper.
 *
 * Setup once:
 *   1. https://console.cloud.google.com → new project → enable "Gmail API"
 *   2. OAuth consent screen → External → add your email as a test user
 *   3. Credentials → OAuth client ID → Desktop application
 *      (or Web with redirect http://localhost:53682/oauth2callback)
 *   4. Put client id + secret in .env as GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET
 *   5. Run: pnpm gmail:auth
 *
 * It will print a URL to visit. Approve, paste back the code, and the script
 * prints a refresh token. Save it to .env as GMAIL_REFRESH_TOKEN.
 */
import "dotenv/config";
import http from "node:http";
import { URL } from "node:url";
import { google } from "googleapis";

const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

async function main() {
  const cid = process.env.GMAIL_CLIENT_ID;
  const cs = process.env.GMAIL_CLIENT_SECRET;
  if (!cid || !cs) {
    console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first.");
    process.exit(1);
  }
  const oauth2 = new google.auth.OAuth2(cid, cs, REDIRECT);
  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("Open this URL in your browser:\n");
  console.log("  " + authUrl + "\n");

  const code: string = await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "", `http://localhost:${PORT}`);
        if (url.pathname !== "/oauth2callback") {
          res.writeHead(404).end();
          return;
        }
        const c = url.searchParams.get("code");
        if (!c) {
          res.writeHead(400).end("missing code");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>ok — you can close this tab</h1>");
        server.close();
        resolve(c);
      } catch (err) {
        reject(err);
      }
    });
    server.listen(PORT, () => console.log("Waiting on " + REDIRECT + " …"));
  });

  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    console.error("No refresh_token returned. Revoke at https://myaccount.google.com/permissions and re-run.");
    process.exit(1);
  }
  console.log("\n✓ Save this to .env:\n");
  console.log("GMAIL_REFRESH_TOKEN=" + tokens.refresh_token);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
