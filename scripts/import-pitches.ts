#!/usr/bin/env tsx
/**
 * Scans ../agency for `*-pitch` directories and seeds them as prospects.
 *
 * Idempotent: re-running updates existing rows.
 *
 * Optional override: create scripts/pitches.overrides.json like:
 *   { "abbey-dental-iom-pitch": { "business": "Abbey Dental",
 *       "contactEmail": "info@abbeydental.im", "location": "Isle of Man",
 *       "pitchUrl": "https://abbey-dental-iom.vercel.app", "status": "emailed" } }
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { inferRegion, inferIndustry } from "../lib/classify.js";

const BASE = process.env.CONTROL_BASE_URL ?? process.env.NEXT_PUBLIC_TRACK_BASE ?? "http://localhost:3000";
const TOKEN = process.env.CONTROL_API_TOKEN;
if (!TOKEN) { console.error("CONTROL_API_TOKEN missing"); process.exit(1); }

const AGENCY_DIR = path.resolve(process.cwd(), "..", "agency");
if (!fs.existsSync(AGENCY_DIR)) {
  console.error("not found: " + AGENCY_DIR);
  process.exit(1);
}

const OVERRIDES_PATH = path.resolve(process.cwd(), "scripts", "pitches.overrides.json");
const overrides: Record<string, any> = fs.existsSync(OVERRIDES_PATH)
  ? JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf8"))
  : {};

function humanise(name: string): string {
  const stripped = name.replace(/-pitch$/, "").replace(/-iom$/, "");
  return stripped
    .split("-")
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

function readJsonSafe<T = any>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

function guessPitchUrl(dir: string, _slug: string): string | null {
  // Only return a URL if there's real evidence of a deployment:
  //   1. .vercel/project.json (created by `vercel link` / first deploy)
  //   2. package.json#homepage explicitly set to an http(s) URL
  // Never guess from slug — that produced dead URLs in earlier runs.
  const vercelProject = readJsonSafe<any>(path.join(dir, ".vercel", "project.json"));
  if (vercelProject?.projectName) {
    return `https://${vercelProject.projectName}.vercel.app`;
  }
  const pkg = readJsonSafe<any>(path.join(dir, "package.json"));
  if (pkg?.homepage && /^https?:\/\//.test(pkg.homepage)) return pkg.homepage;
  return null;
}

async function upsert(p: any) {
  const res = await fetch(BASE + "/api/prospects", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN },
    body: JSON.stringify(p),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status}: ${t}`);
  }
  return res.json();
}

async function main() {
  const dirs = fs
    .readdirSync(AGENCY_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.endsWith("-pitch"));

  console.log(`Found ${dirs.length} pitch directories`);
  let created = 0;
  let updated = 0;

  for (const d of dirs) {
    const slug = d.name;
    const override = overrides[slug] ?? {};
    const business = override.business ?? humanise(slug);
    const location = override.location ?? inferRegion(slug);
    const industry = override.industry ?? inferIndustry(slug);
    const pkgPath = path.join(AGENCY_DIR, slug, "package.json");
    let pitchDeployedAt: string | null = null;
    if (fs.existsSync(pkgPath)) {
      const stat = fs.statSync(pkgPath);
      pitchDeployedAt = stat.mtime.toISOString();
    }

    const pitchUrl = override.pitchUrl ?? guessPitchUrl(path.join(AGENCY_DIR, slug), slug);

    const payload = {
      slug,
      business,
      location,
      industry,
      contactName: override.contactName ?? null,
      contactEmail: override.contactEmail ?? null,
      website: override.website ?? null,
      pitchUrl,
      pitchDeployedAt,
      status: override.status ?? "mock_built",
      notes: override.notes ?? null,
      tags: override.tags ?? ["imported"],
    };

    try {
      const out = await upsert(payload);
      if (out.created) created++;
      else updated++;
      process.stdout.write(out.created ? "+" : ".");
    } catch (e) {
      console.error("\nfailed " + slug + ": " + (e as Error).message);
    }
  }
  console.log(`\n✓ done — created ${created}, updated ${updated}`);
}

main();
