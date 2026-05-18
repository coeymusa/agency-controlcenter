#!/usr/bin/env tsx
/**
 * HEAD-checks every prospect's pitchUrl. For dead / non-existent ones,
 * also checks whether `../agency/<slug>/.vercel/project.json` exists.
 * If both fail, clears the pitchUrl and tags the prospect "url-dead".
 *
 *   pnpm tsx scripts/verify-urls.ts              # report only
 *   pnpm tsx scripts/verify-urls.ts --apply      # actually clear
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.CONTROL_BASE_URL ?? process.env.NEXT_PUBLIC_TRACK_BASE ?? "http://localhost:3000";
const TOKEN = process.env.CONTROL_API_TOKEN;
if (!TOKEN) { console.error("CONTROL_API_TOKEN missing"); process.exit(1); }

const apply = process.argv.includes("--apply");
const AGENCY_DIR = path.resolve(process.cwd(), "..", "agency");

async function head(url: string): Promise<number> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ac.signal });
    clearTimeout(t);
    return res.status;
  } catch {
    return 0;
  }
}

async function getAll() {
  const res = await fetch(BASE + "/api/prospects", {
    headers: { Authorization: "Bearer " + TOKEN },
  });
  if (!res.ok) throw new Error(await res.text());
  const j = await res.json();
  return j.prospects as any[];
}

async function patch(slug: string, body: any) {
  const res = await fetch(BASE + "/api/prospects/" + slug, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(slug + ": " + (await res.text()));
}

async function main() {
  const prospects = await getAll();
  let live = 0, dead = 0, missing = 0;
  const deadOnes: { slug: string; url: string; deployed: boolean }[] = [];

  for (const p of prospects) {
    if (!p.pitchUrl) { missing++; continue; }
    const status = await head(p.pitchUrl);
    const localDir = path.join(AGENCY_DIR, p.slug);
    const deployed = fs.existsSync(path.join(localDir, ".vercel", "project.json"));
    if (status >= 200 && status < 400) {
      process.stdout.write("✓");
      live++;
    } else {
      process.stdout.write("✗");
      dead++;
      deadOnes.push({ slug: p.slug, url: p.pitchUrl, deployed });
    }
  }
  console.log(`\n\nlive: ${live}   dead: ${dead}   no-url: ${missing}\n`);

  if (deadOnes.length > 0) {
    console.log("Dead URLs:");
    for (const d of deadOnes) {
      console.log(`  ${d.deployed ? "(linked)" : "(unlinked)"}  ${d.slug.padEnd(40)} ${d.url}`);
    }
  }

  if (apply && deadOnes.length > 0) {
    console.log("\nClearing pitchUrl on the unlinked ones (kept for linked-but-unreachable cases) …");
    for (const d of deadOnes) {
      if (d.deployed) continue;
      const tagSet = new Set<string>(["imported", "url-dead"]);
      await patch(d.slug, { pitchUrl: null, tags: Array.from(tagSet) });
    }
    console.log("done.");
  } else if (deadOnes.length > 0) {
    console.log("\nRe-run with --apply to clear pitchUrl on unlinked dead URLs.");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
