import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = parseInt(raw.replace(/\.png$/, ""), 10);
  if (Number.isFinite(id) && id > 0) {
    try {
      const [email] = await db.select().from(schema.emails).where(eq(schema.emails.id, id)).limit(1);
      if (email) {
        await db.insert(schema.events).values({
          type: "email_open",
          emailId: email.id,
          prospectId: email.prospectId,
          ipAddr: req.headers.get("x-forwarded-for") ?? null,
          userAgent: req.headers.get("user-agent") ?? null,
        });
        if (email.prospectId) {
          await db
            .update(schema.prospects)
            .set({ status: "opened", updatedAt: new Date() })
            .where(eq(schema.prospects.id, email.prospectId));
        }
      }
    } catch (err) {
      console.error("[track-open]", err);
    }
  }
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Content-Length": String(PIXEL.length),
    },
  });
}
