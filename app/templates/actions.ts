"use server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { STARTER_TEMPLATES } from "@/lib/templates";

export async function saveTemplate(args: { id?: number; name: string; scope: string; subject: string; body: string }) {
  if (args.id) {
    await db.update(schema.emailTemplates)
      .set({ name: args.name, scope: args.scope, subject: args.subject, body: args.body, updatedAt: new Date() })
      .where(eq(schema.emailTemplates.id, args.id));
  } else {
    await db.insert(schema.emailTemplates).values({
      name: args.name, scope: args.scope, subject: args.subject, body: args.body,
    });
  }
  revalidatePath("/templates");
  return { ok: true };
}

export async function deleteTemplate(id: number) {
  await db.delete(schema.emailTemplates).where(eq(schema.emailTemplates.id, id));
  revalidatePath("/templates");
  return { ok: true };
}

export async function seedStarterTemplates() {
  const existing = await db.select().from(schema.emailTemplates);
  if (existing.length > 0) return { ok: false, error: "templates already exist" };
  for (const t of STARTER_TEMPLATES) {
    await db.insert(schema.emailTemplates).values({
      name: t.name, scope: t.scope, subject: t.subject, body: t.body,
    });
  }
  revalidatePath("/templates");
  return { ok: true, count: STARTER_TEMPLATES.length };
}
