import { db, schema } from "./db";
import { eq } from "drizzle-orm";

// Setting keys we know about. Stored in the DB and editable from /settings.
// Falls back to process.env if a key isn't set in the DB.
export const SETTING_KEYS = [
  // Outlook / Microsoft Graph
  "OUTLOOK_TENANT",
  "OUTLOOK_CLIENT_ID",
  "OUTLOOK_REFRESH_TOKEN",
  "OUTLOOK_USER",

  // Gmail
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
  "GMAIL_USER",

  // Resend (send + inbound)
  "RESEND_API_KEY",
  "RESEND_FROM",
  "RESEND_REPLY_TO",
  "RESEND_INBOUND_SECRET",

  // Outbound defaults
  "DEFAULT_FROM_ADDRESS",
  "DEFAULT_FROM_NAME",
  "DEFAULT_SIGNATURE",

  // Hosting
  "PUBLIC_BASE_URL",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export const SECRET_KEYS: ReadonlySet<SettingKey> = new Set<SettingKey>([
  "OUTLOOK_REFRESH_TOKEN",
  "OUTLOOK_CLIENT_ID",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
  "RESEND_API_KEY",
  "RESEND_INBOUND_SECRET",
]);

export async function getSetting(key: SettingKey): Promise<string | null> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  if (row?.value && row.value.length > 0) return row.value;
  const envFallback = process.env[key];
  return envFallback && envFallback.length > 0 ? envFallback : null;
}

export async function getSettings(keys: readonly SettingKey[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const k of keys) out[k] = await getSetting(k);
  return out;
}

export async function setSetting(key: SettingKey, value: string | null): Promise<void> {
  const isSecret = SECRET_KEYS.has(key);
  const v = value && value.length > 0 ? value : null;
  await db
    .insert(schema.settings)
    .values({ key, value: v, isSecret })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: v, isSecret, updatedAt: new Date() } });
}

export async function listSettings(): Promise<{ key: string; value: string | null; isSecret: boolean; fromEnv: boolean }[]> {
  const rows = await db.select().from(schema.settings);
  const map = new Map(rows.map((r) => [r.key, r]));
  return SETTING_KEYS.map((k) => {
    const row = map.get(k);
    const dbVal = row?.value ?? null;
    const envVal = process.env[k];
    const value = dbVal ?? (envVal && envVal.length > 0 ? envVal : null);
    return {
      key: k,
      value: value,
      isSecret: SECRET_KEYS.has(k),
      fromEnv: !dbVal && !!envVal,
    };
  });
}

export function maskSecret(v: string | null): string {
  if (!v) return "";
  if (v.length <= 8) return "•".repeat(v.length);
  return v.slice(0, 4) + "•".repeat(Math.max(0, v.length - 8)) + v.slice(-4);
}
