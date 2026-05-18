import { db, schema } from "@/lib/db";
import { eq, and, isNull, count } from "drizzle-orm";
import { computeFollowups } from "@/lib/followups";

// Server-side computation of nav counts so the layout can show them inline.

export async function getNavCounts() {
  const [unreadInbound] = await db
    .select({ n: count() })
    .from(schema.emails)
    .where(and(eq(schema.emails.direction, "inbound"), isNull(schema.emails.readAt)));
  const followups = await computeFollowups({});
  return { inbox: Number(unreadInbound?.n ?? 0), followups: followups.length };
}
