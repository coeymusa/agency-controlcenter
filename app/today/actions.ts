"use server";
import { db, schema } from "@/lib/db";
import { eq, and, desc, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sendPitchEmail } from "@/app/prospects/[slug]/actions";
import { substitute, type Vars } from "@/lib/templates";
import { getSetting } from "@/lib/settings";

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

export async function dismissToday(slug: string, days = 1) {
  const until = new Date(Date.now() + days * 86400_000);
  await db.update(schema.prospects).set({ snoozedUntil: until, updatedAt: new Date() }).where(eq(schema.prospects.slug, slug));
  revalidatePath("/today");
  revalidatePath("/");
  return { ok: true };
}
