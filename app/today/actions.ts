"use server";
import { db, schema } from "@/lib/db";
import { eq, and, desc, isNull, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sendPitchEmail } from "@/app/prospects/[slug]/actions";
import { substitute, type Vars } from "@/lib/templates";
import { getSetting } from "@/lib/settings";

// Preview the substituted subject + body for each prospect in a bulk batch.
// Returns one entry per slug; flags blockers so the modal can grey out unsendable rows.
export type BulkPreviewRow = {
  slug: string;
  business: string;
  contactEmail: string | null;
  subject: string;
  body: string;
  blocker: string | null;
};

export async function previewBulkSends(
  slugs: string[],
  scope: "cold" | "followup" = "cold",
): Promise<{ rows: BulkPreviewRow[]; templateName: string | null }> {
  if (slugs.length === 0) return { rows: [], templateName: null };

  const [tpl] = await db
    .select()
    .from(schema.emailTemplates)
    .where(eq(schema.emailTemplates.scope, scope))
    .orderBy(desc(schema.emailTemplates.updatedAt))
    .limit(1);

  const prospects = await db
    .select()
    .from(schema.prospects)
    .where(inArray(schema.prospects.slug, slugs));

  const signature = (await getSetting("DEFAULT_SIGNATURE")) ?? "";
  const bySlug = new Map(prospects.map((p) => [p.slug, p]));

  const rows: BulkPreviewRow[] = slugs.map((slug) => {
    const p = bySlug.get(slug);
    if (!p) return { slug, business: slug, contactEmail: null, subject: "", body: "", blocker: "prospect not found" };
    if (!tpl) return { slug, business: p.business, contactEmail: p.contactEmail, subject: "", body: "", blocker: `no ${scope} template configured` };
    let blocker: string | null = null;
    if (!p.contactEmail) blocker = "no contact email";
    else if (scope === "cold" && tpl.body.includes("{{issues}}") && !p.pitchIssues?.trim()) blocker = "no pitch issues set";
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
      slug,
      business: p.business,
      contactEmail: p.contactEmail,
      subject: substitute(tpl.subject, vars),
      body: substitute(tpl.body, vars),
      blocker,
    };
  });
  return { rows, templateName: tpl?.name ?? null };
}

// One-click send using the first template that matches the given scope.
// scope = "followup" for bump emails, "cold" for first contacts, etc.
export async function oneClickSend(slug: string, scope: "cold" | "followup" | "breakup" | "other"): Promise<{ ok: true; emailId: number } | { ok: false; error: string }> {
  const [prospect] = await db.select().from(schema.prospects).where(eq(schema.prospects.slug, slug)).limit(1);
  if (!prospect) return { ok: false, error: "prospect not found" };
  if (!prospect.contactEmail) return { ok: false, error: "no contact email — set one in the prospect detail page first" };

  const [tpl] = await db
    .select()
    .from(schema.emailTemplates)
    .where(eq(schema.emailTemplates.scope, scope))
    .orderBy(desc(schema.emailTemplates.updatedAt))
    .limit(1);
  if (!tpl) return { ok: false, error: `no ${scope} template yet — add one at /templates` };

  const signature = (await getSetting("DEFAULT_SIGNATURE")) ?? "";
  const vars: Vars = {
    business: prospect.business,
    contactName: prospect.contactName,
    contactEmail: prospect.contactEmail,
    website: prospect.website,
    pitchUrl: prospect.pitchUrl,
    pitchIssues: prospect.pitchIssues,
    location: prospect.location,
    industry: prospect.industry,
    signature,
  };
  // Refuse to fire the cold template if pitch issues are missing — sending
  // bare `{{issues}}` placeholder would embarrass us.
  if (scope === "cold" && tpl.body.includes("{{issues}}") && !prospect.pitchIssues?.trim()) {
    return { ok: false, error: "Add 3 issue bullets on the prospect page first (the cold template needs them)." };
  }
  const subject = substitute(tpl.subject, vars);
  const body = substitute(tpl.body, vars);

  const r = await sendPitchEmail(slug, { subject, body });
  if ("ok" in r && r.ok) {
    revalidatePath("/today");
    revalidatePath("/");
    revalidatePath("/followups");
    return { ok: true, emailId: r.emailId };
  }
  return { ok: false, error: "error" in r ? r.error : "unknown" };
}

// Bulk-send: fires `oneClickSend` for each slug in sequence with a small pause
// between calls to be gentle on Resend. Skips any prospect missing email or
// pitchIssues — those return errors from `oneClickSend` and end up in `failed`.
export async function bulkSendReady(
  slugs: string[],
  scope: "cold" | "followup" = "cold",
): Promise<{ sent: number; failed: { slug: string; error: string }[] }> {
  const failed: { slug: string; error: string }[] = [];
  let sent = 0;
  for (const slug of slugs) {
    const r = await oneClickSend(slug, scope);
    if (r.ok) sent++;
    else failed.push({ slug, error: r.error });
    await new Promise((res) => setTimeout(res, 400));
  }
  revalidatePath("/today");
  revalidatePath("/");
  revalidatePath("/followups");
  return { sent, failed };
}

export async function dismissToday(slug: string, days = 1) {
  const until = new Date(Date.now() + days * 86400_000);
  await db.update(schema.prospects).set({ snoozedUntil: until, updatedAt: new Date() }).where(eq(schema.prospects.slug, slug));
  revalidatePath("/today");
  revalidatePath("/");
  return { ok: true };
}
