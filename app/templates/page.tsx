import { db, schema } from "@/lib/db";
import { desc } from "drizzle-orm";
import { TemplatesEditor } from "./TemplatesEditor";

export const dynamic = "force-dynamic";

export default async function Templates() {
  const rows = await db.select().from(schema.emailTemplates).orderBy(desc(schema.emailTemplates.updatedAt));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Email templates</h1>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Reusable cold pitches, follow-ups, and break-up emails. Variables substitute live in the composer.
        </div>
      </div>
      <TemplatesEditor templates={rows} />
    </div>
  );
}
