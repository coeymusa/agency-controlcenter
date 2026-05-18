"use server";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

type Status =
  | "lead" | "researched" | "mock_built" | "emailed"
  | "opened" | "clicked" | "replied" | "meeting"
  | "won" | "lost" | "ignored";

export async function paletteSetStatus(slug: string, status: Status) {
  const [existing] = await db.select().from(schema.prospects).where(eq(schema.prospects.slug, slug)).limit(1);
  if (!existing) return { ok: false as const, error: "not found" };
  await db.update(schema.prospects).set({ status, updatedAt: new Date() }).where(eq(schema.prospects.id, existing.id));
  if (existing.status !== status) {
    await db.insert(schema.events).values({
      type: "status_change", prospectId: existing.id,
      metadata: { from: existing.status, to: status, via: "palette" },
    });
  }
  revalidatePath("/"); revalidatePath(`/prospects/${slug}`); revalidatePath("/followups");
  return { ok: true as const };
}

export async function paletteSnooze(slug: string, days: number | null) {
  const until = days === null ? null : new Date(Date.now() + days * 86400_000);
  await db.update(schema.prospects).set({ snoozedUntil: until, updatedAt: new Date() }).where(eq(schema.prospects.slug, slug));
  revalidatePath("/"); revalidatePath("/followups");
  return { ok: true as const };
}

export async function paletteRunGmailSync(): Promise<{ ok: true; sent: number; received: number } | { ok: false; error: string }> {
  try {
    const { runSync } = await import("@/lib/gmail-sync");
    const r = await runSync();
    revalidatePath("/"); revalidatePath("/inbox");
    return { ok: true, sent: 0, received: r.newReplies };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function paletteRunOutlookSync(): Promise<{ ok: true; received: number } | { ok: false; error: string }> {
  try {
    const { runOutlookSync } = await import("@/lib/outlook-sync");
    const r = await runOutlookSync();
    revalidatePath("/"); revalidatePath("/inbox");
    return { ok: true, received: r.newReplies };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function paletteRunDispatch(): Promise<{ ok: true; sent: number; failed: number } | { ok: false; error: string }> {
  try {
    const { dispatchScheduled } = await import("@/lib/dispatch");
    const r = await dispatchScheduled();
    revalidatePath("/"); revalidatePath("/scheduled");
    return { ok: true, sent: r.sent, failed: r.failed.length };
  } catch (e) { return { ok: false, error: String(e) }; }
}
