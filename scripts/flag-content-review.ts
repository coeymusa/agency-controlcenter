#!/usr/bin/env tsx
/**
 * Tags every imported prospect with "needs-content-review" so you can
 * eyeball each deployed pitch and confirm the content matches the business.
 * Several auto-imported deployments had wrong images / themes.
 *
 * Also adds "url-dead" for ones the verifier couldn't reach.
 */
import "dotenv/config";

const BASE = process.env.CONTROL_BASE_URL ?? "http://localhost:3000";
const TOKEN = process.env.CONTROL_API_TOKEN;
if (!TOKEN) { console.error("CONTROL_API_TOKEN missing"); process.exit(1); }

async function getAll() {
  const r = await fetch(BASE + "/api/prospects", { headers: { Authorization: "Bearer " + TOKEN } });
  return (await r.json()).prospects as any[];
}
async function patch(slug: string, body: any) {
  await fetch(BASE + "/api/prospects/" + slug, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN },
    body: JSON.stringify(body),
  });
}
async function head(url: string): Promise<number> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    const r = await fetch(url, { method: "HEAD", redirect: "follow", signal: ac.signal });
    clearTimeout(t);
    return r.status;
  } catch { return 0; }
}

async function main() {
  const rows = await getAll();
  let flagged = 0;
  let deadFlagged = 0;
  for (const p of rows) {
    if (!(p.tags ?? []).includes("imported")) continue;
    const tags = new Set<string>(p.tags ?? []);
    tags.add("needs-content-review");
    if (p.pitchUrl) {
      const s = await head(p.pitchUrl);
      if (!(s >= 200 && s < 400)) { tags.add("url-dead"); deadFlagged++; }
    }
    await patch(p.slug, { tags: Array.from(tags) });
    process.stdout.write(".");
    flagged++;
  }
  console.log(`\n✓ flagged ${flagged} prospects with needs-content-review (${deadFlagged} also tagged url-dead)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
