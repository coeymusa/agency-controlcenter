"use server";
import { db, schema } from "@/lib/db";
import { eq, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function markEmailRead(emailId: number) {
  await db.update(schema.emails)
    .set({ readAt: new Date() })
    .where(and(eq(schema.emails.id, emailId), isNull(schema.emails.readAt)));
  revalidatePath("/inbox");
}

export async function markEmailUnread(emailId: number) {
  await db.update(schema.emails)
    .set({ readAt: null })
    .where(eq(schema.emails.id, emailId));
  revalidatePath("/inbox");
}

export async function markProspectInboxRead(prospectId: number) {
  await db.update(schema.emails)
    .set({ readAt: new Date() })
    .where(and(
      eq(schema.emails.prospectId, prospectId),
      eq(schema.emails.direction, "inbound"),
      isNull(schema.emails.readAt),
    ));
  revalidatePath("/inbox");
}

export async function archiveEmail(emailId: number) {
  await db.update(schema.emails)
    .set({ archivedAt: new Date(), readAt: new Date() })
    .where(eq(schema.emails.id, emailId));
  revalidatePath("/inbox");
}

export async function unarchiveEmail(emailId: number) {
  await db.update(schema.emails)
    .set({ archivedAt: null })
    .where(eq(schema.emails.id, emailId));
  revalidatePath("/inbox");
}
