"use server";
import { setSetting, type SettingKey, SETTING_KEYS } from "@/lib/settings";
import { revalidatePath } from "next/cache";

export async function saveSettings(formData: FormData) {
  for (const k of SETTING_KEYS) {
    const raw = formData.get(k);
    if (raw === null) continue;
    const v = String(raw).trim();
    await setSetting(k as SettingKey, v.length > 0 ? v : null);
  }
  revalidatePath("/settings");
}

// --- Outlook device-code flow, driven entirely from the UI ---
// Stage 1: kick off the device code request → return URL + code to display.
// Stage 2: poll the token endpoint until the user has authorised, then save
// the refresh token into the settings table.

const POLL_KEY = "__outlook_device_state";
const globalState = globalThis as unknown as {
  [POLL_KEY]?: {
    deviceCode: string;
    interval: number;
    deadline: number;
    clientId: string;
    tenant: string;
  };
};

export async function startOutlookConnect() {
  const { getSetting } = await import("@/lib/settings");
  const clientId = await getSetting("OUTLOOK_CLIENT_ID");
  const tenant = (await getSetting("OUTLOOK_TENANT")) ?? "common";
  if (!clientId) return { ok: false as const, error: "Set OUTLOOK_CLIENT_ID first." };
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/devicecode`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, scope: "offline_access Mail.Read Mail.Send" }),
  });
  if (!res.ok) return { ok: false as const, error: await res.text() };
  const body = (await res.json()) as { user_code: string; device_code: string; verification_uri: string; expires_in: number; interval: number };
  globalState[POLL_KEY] = {
    deviceCode: body.device_code,
    interval: body.interval || 5,
    deadline: Date.now() + body.expires_in * 1000,
    clientId,
    tenant,
  };
  return { ok: true as const, url: body.verification_uri, code: body.user_code, expiresIn: body.expires_in };
}

export async function pollOutlookConnect(): Promise<
  | { ok: true; pending: true }
  | { ok: true; pending: false; user?: string }
  | { ok: false; error: string }
> {
  const state = globalState[POLL_KEY];
  if (!state) return { ok: false, error: "No connect in progress — click Connect Outlook first." };
  if (Date.now() > state.deadline) {
    delete globalState[POLL_KEY];
    return { ok: false, error: "Code expired. Try again." };
  }
  const res = await fetch(`https://login.microsoftonline.com/${state.tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: state.clientId,
      device_code: state.deviceCode,
    }),
  });
  const body = (await res.json()) as any;
  if (res.ok && body.refresh_token) {
    await setSetting("OUTLOOK_REFRESH_TOKEN", body.refresh_token);
    let user: string | undefined;
    if (body.id_token) {
      try {
        const claims = JSON.parse(Buffer.from(body.id_token.split(".")[1], "base64").toString("utf8"));
        user = claims.email ?? claims.preferred_username;
        if (user) await setSetting("OUTLOOK_USER", user);
      } catch {/* ignore */}
    }
    delete globalState[POLL_KEY];
    revalidatePath("/settings");
    return { ok: true, pending: false, user };
  }
  if (body.error === "authorization_pending" || body.error === "slow_down") {
    return { ok: true, pending: true };
  }
  delete globalState[POLL_KEY];
  return { ok: false, error: body.error_description ?? body.error ?? "Unknown error" };
}

export async function disconnectOutlook() {
  await setSetting("OUTLOOK_REFRESH_TOKEN", null);
  await setSetting("OUTLOOK_USER", null);
  revalidatePath("/settings");
}

export async function getGmailAuthUrl(origin: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { getSetting } = await import("@/lib/settings");
  const cid = await getSetting("GMAIL_CLIENT_ID");
  if (!cid) return { ok: false, error: "Set GMAIL_CLIENT_ID first." };
  const redirectUri = origin + "/api/gmail/callback";
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", cid);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set(
    "scope",
    [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
  );
  return { ok: true, url: url.toString() };
}

export async function disconnectGmail() {
  await setSetting("GMAIL_REFRESH_TOKEN", null);
  await setSetting("GMAIL_USER", null);
  revalidatePath("/settings");
}

// --- Run sync from UI ---

export async function runOutlookSyncNow() {
  try {
    const { runOutlookSync } = await import("@/lib/outlook-sync");
    const r = await runOutlookSync();
    revalidatePath("/");
    revalidatePath("/events");
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, error: String(e) };
  }
}

export async function runGmailSyncNow() {
  try {
    const { runSync } = await import("@/lib/gmail-sync");
    const r = await runSync();
    revalidatePath("/");
    revalidatePath("/events");
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, error: String(e) };
  }
}
