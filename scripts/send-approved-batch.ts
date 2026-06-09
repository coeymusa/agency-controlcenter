import "dotenv/config";
import { db, schema } from "../lib/db";
import { substitute, type Vars } from "../lib/templates";
import { desc, eq } from "drizzle-orm";
import fs from "node:fs";

const BASE = "https://agency-control-center-one.vercel.app";
const TOKEN = (
  fs.readFileSync(
    "C:/Users/Corey/.claude/projects/C--Users-Corey-Workspace-agency/memory/reference_control_center_creds.md",
    "utf8",
  ).match(/[0-9a-f]{64}/) || [""]
)[0];

const SLUGS = [
  "baravellis-conwy",
  "cheese-shop-nantwich",
  "hay-makers",
  "blair-and-sheridan-glasgow",
  "speedframe-lincoln",
];

async function main() {
  if (!TOKEN) throw new Error("token not found");

  // Same selection the /today one-click send uses: most-recent cold template.
  const [tpl] = await db
    .select()
    .from(schema.emailTemplates)
    .where(eq(schema.emailTemplates.scope, "cold"))
    .orderBy(desc(schema.emailTemplates.updatedAt))
    .limit(1);
  console.log(`Template: #${tpl.id} ${tpl.name}`);

  for (const slug of SLUGS) {
    const [p] = await db.select().from(schema.prospects).where(eq(schema.prospects.slug, slug)).limit(1);
    if (!p) { console.log(`SKIP ${slug}: not found`); continue; }
    const vars: Vars = {
      business: p.business, contactName: p.contactName, contactEmail: p.contactEmail,
      website: p.website, pitchUrl: p.pitchUrl, pitchIssues: p.pitchIssues,
      location: p.location, industry: p.industry, signature: "",
    };
    const subject = substitute(tpl.subject, vars);
    const body = substitute(tpl.body, vars);

    // Guard: never send a body with an unsubstituted placeholder.
    if (/\{\{|\{[A-Z_]+\}/.test(body) || /\{\{|\{[A-Z_]+\}/.test(subject)) {
      console.log(`ABORT ${slug}: unsubstituted placeholder remains — wrong template`);
      process.exit(1);
    }
    if (p.status === "emailed") { console.log(`SKIP ${slug}: already emailed`); continue; }

    const res = await fetch(`${BASE}/api/emails/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN },
      body: JSON.stringify({ prospectSlug: slug, subject, body }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && json.ok) {
      console.log(`SENT ${slug} -> ${p.contactEmail} | resendId=${json.resendId} | links=${(json.links || []).length}`);
    } else {
      console.log(`FAIL ${slug} (${res.status}): ${json.error || JSON.stringify(json)}`);
      process.exit(1); // stop the batch on first failure
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  console.log("DONE");
  process.exit(0);
}
main().catch((e) => { console.log("ERR " + String(e)); process.exit(1); });
