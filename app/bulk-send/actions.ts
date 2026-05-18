"use server";
import { db, schema } from "@/lib/db";
import { eq, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { substitute, type Vars } from "@/lib/templates";
import { sendPitchEmail } from "@/app/prospects/[slug]/actions";

export type BulkFilter = {
  templateId: number;
  statuses?: string[];
  region?: string;
  industry?: string;
  tag?: string;
};

export async function matchProspects(filter: Omit<BulkFilter, "templateId">) {
  let rows = await db.select().from(schema.prospects);
  rows = rows.filter((p) => !!p.contactEmail);
  if (filter.statuses?.length) rows = rows.filter((p) => filter.statuses!.includes(p.status));
  if (filter.region) rows = rows.filter((p) => p.location === filter.region);
  if (filter.industry) rows = rows.filter((p) => p.industry === filter.industry);
  if (filter.tag) rows = rows.filter((p) => ((p.tags ?? []) as string[]).includes(filter.tag!));
  // Skip prospects we've already emailed once unless explicitly asked
  return rows;
}

export async function previewBulkSend(filter: BulkFilter) {
  const [tpl] = await db.select().from(schema.emailTemplates).where(eq(schema.emailTemplates.id, filter.templateId)).limit(1);
  if (!tpl) return { ok: false as const, error: "template not found" };
  const matched = await matchProspects(filter);
  const { getSetting } = await import("@/lib/settings");
  const signature = (await getSetting("DEFAULT_SIGNATURE")) ?? "";
  const previews = matched.slice(0, 3).map((p) => {
    const vars: Vars = {
      business: p.business,
      contactName: p.contactName,
      contactEmail: p.contactEmail,
      website: p.website,
      pitchUrl: p.pitchUrl,
      pitchIssues: p.pitchIssues,
      location: p.location,
      industry: p.industry,
      signature,
    };
    return {
      slug: p.slug,
      business: p.business,
      to: p.contactEmail,
      subject: substitute(tpl.subject, vars),
      body: substitute(tpl.body, vars),
    };
  });
  return { ok: true as const, count: matched.length, previews };
}

export async function executeBulkSend(filter: BulkFilter): Promise<{ ok: true; sent: number; failed: { slug: string; error: string }[] } | { ok: false; error: string }> {
  const [tpl] = await db.select().from(schema.emailTemplates).where(eq(schema.emailTemplates.id, filter.templateId)).limit(1);
  if (!tpl) return { ok: false, error: "template not found" };
  const matched = await matchProspects(filter);
  const { getSetting } = await import("@/lib/settings");
  const signature = (await getSetting("DEFAULT_SIGNATURE")) ?? "";

  const failed: { slug: string; error: string }[] = [];
  let sent = 0;

  for (const p of matched) {
    const vars: Vars = {
      business: p.business,
      contactName: p.contactName,
      contactEmail: p.contactEmail,
      website: p.website,
      pitchUrl: p.pitchUrl,
      pitchIssues: p.pitchIssues,
      location: p.location,
      industry: p.industry,
      signature,
    };
    const subject = substitute(tpl.subject, vars);
    const body = substitute(tpl.body, vars);
    const r = await sendPitchEmail(p.slug, { subject, body });
    if ("ok" in r && r.ok) sent++;
    else failed.push({ slug: p.slug, error: "error" in r ? r.error : "unknown" });
    // Throttle: gentle pace to stay friendly with Resend + give Vercel headroom
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  revalidatePath("/");
  revalidatePath("/emails");
  return { ok: true, sent, failed };
}
