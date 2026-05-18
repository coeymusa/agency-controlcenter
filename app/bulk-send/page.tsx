import { db, schema } from "@/lib/db";
import { desc } from "drizzle-orm";
import { BulkSendUI } from "./BulkSendUI";

export const dynamic = "force-dynamic";

export default async function BulkSend() {
  const templates = await db.select().from(schema.emailTemplates).orderBy(desc(schema.emailTemplates.updatedAt));
  const prospects = await db.select().from(schema.prospects);
  const regions = Array.from(new Set(prospects.map((p) => p.location).filter(Boolean))).sort() as string[];
  const sectors = Array.from(new Set(prospects.map((p) => p.industry).filter(Boolean))).sort() as string[];
  const tags = Array.from(new Set(prospects.flatMap((p) => (p.tags ?? []) as string[]))).sort();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Bulk send</h1>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Pick a template and filter, preview the first three, then send to every matching prospect with personalised variables.
        </div>
      </div>
      <BulkSendUI templates={templates.map((t) => ({ id: t.id, name: t.name, scope: t.scope, subject: t.subject }))} regions={regions} sectors={sectors} tags={tags} />
    </div>
  );
}
