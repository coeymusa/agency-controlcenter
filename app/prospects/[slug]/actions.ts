"use server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type Status =
  | "lead" | "researched" | "mock_built" | "emailed"
  | "opened" | "clicked" | "replied" | "meeting"
  | "won" | "lost" | "ignored";

export async function updateStatus(slug: string, status: Status) {
  const [existing] = await db.select().from(schema.prospects).where(eq(schema.prospects.slug, slug)).limit(1);
  if (!existing) return { ok: false };
  await db.update(schema.prospects).set({ status, updatedAt: new Date() }).where(eq(schema.prospects.id, existing.id));
  if (existing.status !== status) {
    await db.insert(schema.events).values({
      type: "status_change",
      prospectId: existing.id,
      metadata: { from: existing.status, to: status, via: "ui" },
    });
  }
  revalidatePath(`/prospects/${slug}`);
  revalidatePath(`/`);
  return { ok: true };
}

export async function addTag(slug: string, tag: string) {
  const t = tag.trim();
  if (!t) return { ok: false };
  const [existing] = await db.select().from(schema.prospects).where(eq(schema.prospects.slug, slug)).limit(1);
  if (!existing) return { ok: false };
  const tags = Array.from(new Set([...((existing.tags ?? []) as string[]), t]));
  await db.update(schema.prospects).set({ tags, updatedAt: new Date() }).where(eq(schema.prospects.id, existing.id));
  revalidatePath(`/prospects/${slug}`);
  return { ok: true };
}

export async function removeTag(slug: string, tag: string) {
  const [existing] = await db.select().from(schema.prospects).where(eq(schema.prospects.slug, slug)).limit(1);
  if (!existing) return { ok: false };
  const tags = ((existing.tags ?? []) as string[]).filter((x) => x !== tag);
  await db.update(schema.prospects).set({ tags, updatedAt: new Date() }).where(eq(schema.prospects.id, existing.id));
  revalidatePath(`/prospects/${slug}`);
  return { ok: true };
}

export async function updateNotes(slug: string, notes: string) {
  const [existing] = await db.select().from(schema.prospects).where(eq(schema.prospects.slug, slug)).limit(1);
  if (!existing) return { ok: false };
  await db.update(schema.prospects).set({ notes, updatedAt: new Date() }).where(eq(schema.prospects.id, existing.id));
  revalidatePath(`/prospects/${slug}`);
  return { ok: true };
}

export async function updateContact(slug: string, fields: { contactName?: string; contactEmail?: string; website?: string; pitchUrl?: string; location?: string; industry?: string }) {
  const [existing] = await db.select().from(schema.prospects).where(eq(schema.prospects.slug, slug)).limit(1);
  if (!existing) return { ok: false };
  await db
    .update(schema.prospects)
    .set({
      contactName: fields.contactName ?? existing.contactName,
      contactEmail: fields.contactEmail ?? existing.contactEmail,
      website: fields.website ?? existing.website,
      pitchUrl: fields.pitchUrl ?? existing.pitchUrl,
      location: fields.location ?? existing.location,
      industry: fields.industry ?? existing.industry,
      updatedAt: new Date(),
    })
    .where(eq(schema.prospects.id, existing.id));
  revalidatePath(`/prospects/${slug}`);
  return { ok: true };
}

export async function updatePitchIssues(slug: string, pitchIssues: string) {
  const [existing] = await db.select().from(schema.prospects).where(eq(schema.prospects.slug, slug)).limit(1);
  if (!existing) return { ok: false };
  await db
    .update(schema.prospects)
    .set({ pitchIssues, updatedAt: new Date() })
    .where(eq(schema.prospects.id, existing.id));
  revalidatePath(`/prospects/${slug}`);
  revalidatePath(`/today`);
  return { ok: true };
}

export async function deleteProspect(slug: string) {
  await db.delete(schema.prospects).where(eq(schema.prospects.slug, slug));
  revalidatePath(`/`);
  return { ok: true };
}

export async function cancelScheduled(emailId: number) {
  // Only remove rows that are still in the queue (not yet handed off to Resend)
  const [row] = await db.select().from(schema.emails).where(eq(schema.emails.id, emailId)).limit(1);
  if (!row || row.resendMessageId) return { ok: false as const, error: "already sent" };
  await db.delete(schema.links).where(eq(schema.links.emailId, emailId));
  await db.delete(schema.events).where(eq(schema.events.emailId, emailId));
  await db.delete(schema.emails).where(eq(schema.emails.id, emailId));
  revalidatePath("/scheduled");
  revalidatePath("/");
  return { ok: true as const };
}

// --- Drafts ---
export async function saveDraft(prospectId: number, args: { subject: string; body: string; fromAddr?: string | null; toAddr?: string | null; inReplyTo?: string | null }) {
  await db
    .insert(schema.emailDrafts)
    .values({
      prospectId,
      subject: args.subject,
      body: args.body,
      fromAddr: args.fromAddr ?? null,
      toAddr: args.toAddr ?? null,
      inReplyTo: args.inReplyTo ?? null,
    })
    .onConflictDoUpdate({
      target: schema.emailDrafts.prospectId,
      set: { subject: args.subject, body: args.body, fromAddr: args.fromAddr ?? null, toAddr: args.toAddr ?? null, inReplyTo: args.inReplyTo ?? null, updatedAt: new Date() },
    });
  return { ok: true as const, savedAt: Date.now() };
}

export async function clearDraft(prospectId: number) {
  await db.delete(schema.emailDrafts).where(eq(schema.emailDrafts.prospectId, prospectId));
  return { ok: true as const };
}

// --- Bulk operations ---
import { inArray } from "drizzle-orm";

export async function bulkSetStatus(slugs: string[], status: Status) {
  if (slugs.length === 0) return { ok: true, count: 0 };
  const before = await db.select().from(schema.prospects).where(inArray(schema.prospects.slug, slugs));
  await db.update(schema.prospects).set({ status, updatedAt: new Date() }).where(inArray(schema.prospects.slug, slugs));
  for (const p of before) {
    if (p.status !== status) {
      await db.insert(schema.events).values({
        type: "status_change",
        prospectId: p.id,
        metadata: { from: p.status, to: status, via: "bulk" },
      });
    }
  }
  revalidatePath("/");
  revalidatePath("/followups");
  return { ok: true, count: slugs.length };
}

export async function bulkAddTag(slugs: string[], tag: string) {
  const t = tag.trim();
  if (slugs.length === 0 || !t) return { ok: true, count: 0 };
  const rows = await db.select().from(schema.prospects).where(inArray(schema.prospects.slug, slugs));
  for (const p of rows) {
    const tags = Array.from(new Set([...((p.tags ?? []) as string[]), t]));
    await db.update(schema.prospects).set({ tags, updatedAt: new Date() }).where(eq(schema.prospects.id, p.id));
  }
  revalidatePath("/");
  return { ok: true, count: rows.length };
}

export async function bulkSnooze(slugs: string[], days: number | null) {
  if (slugs.length === 0) return { ok: true, count: 0 };
  const until = days === null ? null : new Date(Date.now() + days * 86400_000);
  await db.update(schema.prospects).set({ snoozedUntil: until, updatedAt: new Date() }).where(inArray(schema.prospects.slug, slugs));
  revalidatePath("/");
  revalidatePath("/followups");
  return { ok: true, count: slugs.length };
}

export async function bulkDelete(slugs: string[]) {
  if (slugs.length === 0) return { ok: true, count: 0 };
  await db.delete(schema.prospects).where(inArray(schema.prospects.slug, slugs));
  revalidatePath("/");
  return { ok: true, count: slugs.length };
}

export async function sendPitchEmail(
  slug: string,
  args: { to?: string; from?: string; subject: string; body: string; inReplyToInternetMessageId?: string; scheduledFor?: string | null },
): Promise<{ ok: true; emailId: number; resendId: string | null; scheduledFor?: string } | { ok: false; error: string }> {
  const { getSetting } = await import("@/lib/settings");
  const { resendSend, rewriteLinks, htmlWithPixel, textToHtml } = await import("@/lib/resend");
  const { shortCode } = await import("@/lib/auth");
  const [prospect] = await db.select().from(schema.prospects).where(eq(schema.prospects.slug, slug)).limit(1);
  if (!prospect) return { ok: false, error: "prospect not found" };
  const toAddr = args.to ?? prospect.contactEmail ?? "";
  if (!toAddr) return { ok: false, error: "no recipient on file — add contactEmail first" };
  const base = (await getSetting("PUBLIC_BASE_URL")) ?? process.env.NEXT_PUBLIC_TRACK_BASE ?? "";
  if (!base) return { ok: false, error: "PUBLIC_BASE_URL not set — open /settings" };

  // Auto-append the default signature if it's set and not already in the body
  const signature = (await getSetting("DEFAULT_SIGNATURE")) ?? "";
  let bodyWithSig = args.body;
  if (signature && !bodyWithSig.includes(signature)) {
    bodyWithSig = bodyWithSig.trimEnd() + "\n\n" + signature;
  }

  const scheduled = args.scheduledFor ? new Date(args.scheduledFor) : null;
  const isScheduled = scheduled !== null && scheduled.getTime() > Date.now() + 30_000; // 30s buffer

  const [emailRow] = await db.insert(schema.emails).values({
    prospectId: prospect.id,
    direction: "outbound",
    subject: args.subject,
    bodyText: bodyWithSig,
    fromAddr: args.from ?? (await getSetting("RESEND_FROM")) ?? null,
    toAddr,
    sentAt: isScheduled ? null : new Date(),
    scheduledFor: isScheduled ? scheduled : null,
    inReplyTo: args.inReplyToInternetMessageId ?? null,
  }).returning();

  const used = new Set<string>();
  const gen = () => { let c; do { c = shortCode(8); } while (used.has(c)); used.add(c); return c; };
  const { body: rewrittenText, links } = rewriteLinks(bodyWithSig, gen, base);
  for (const l of links) {
    await db.insert(schema.links).values({ code: l.code, emailId: emailRow.id, prospectId: prospect.id, target: l.target });
  }
  let html = textToHtml(rewrittenText);
  html = htmlWithPixel(html, emailRow.id, base);

  // If the user picked a future time, save the row and return — the cron
  // dispatcher will send it when its time arrives.
  if (isScheduled) {
    await db.update(schema.emails).set({ bodyHtml: html }).where(eq(schema.emails.id, emailRow.id));
    await db.insert(schema.events).values({
      type: "note",
      emailId: emailRow.id,
      prospectId: prospect.id,
      metadata: { scheduledFor: scheduled!.toISOString(), action: "scheduled" },
    });
    revalidatePath(`/prospects/${slug}`);
    revalidatePath(`/scheduled`);
    revalidatePath(`/`);
    return { ok: true, emailId: emailRow.id, resendId: null, scheduledFor: scheduled!.toISOString() };
  }

  try {
    const sent = await resendSend({
      to: toAddr, from: args.from, subject: args.subject, html, text: rewrittenText,
      inReplyTo: args.inReplyToInternetMessageId,
    });
    await db.update(schema.emails).set({ bodyHtml: html, resendMessageId: sent.id }).where(eq(schema.emails.id, emailRow.id));
    await db.insert(schema.events).values({
      type: "email_sent", emailId: emailRow.id, prospectId: prospect.id,
      metadata: { subject: args.subject, provider: "resend", resendMessageId: sent.id },
    });
    await db.update(schema.prospects).set({ status: "emailed", updatedAt: new Date() }).where(eq(schema.prospects.id, prospect.id));
    revalidatePath(`/prospects/${slug}`);
    revalidatePath(`/`);
    return { ok: true, emailId: emailRow.id, resendId: sent.id };
  } catch (e) {
    await db.delete(schema.links).where(eq(schema.links.emailId, emailRow.id));
    await db.delete(schema.emails).where(eq(schema.emails.id, emailRow.id));
    return { ok: false, error: String(e) };
  }
}
