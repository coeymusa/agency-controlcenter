"use server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function snooze(slug: string, days: number | null) {
  const until = days === null ? null : new Date(Date.now() + days * 86400_000);
  await db
    .update(schema.prospects)
    .set({ snoozedUntil: until, updatedAt: new Date() })
    .where(eq(schema.prospects.slug, slug));
  revalidatePath("/followups");
  revalidatePath("/");
}
