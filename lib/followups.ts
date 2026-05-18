import { db, schema } from "./db";
import { and, eq, desc } from "drizzle-orm";

export type FollowupRow = {
  prospect: typeof schema.prospects.$inferSelect;
  lastSent: Date | null;
  lastReceived: Date | null;
  daysSinceSent: number;
  lastSubject: string | null;
  isSnoozed: boolean;
};

export const FOLLOWUP_STATUSES = ["emailed", "opened", "clicked"] as const;
export const FOLLOWUP_DEFAULT_DAYS = 5;

export async function computeFollowups(opts: { minDays?: number; includeSnoozed?: boolean } = {}): Promise<FollowupRow[]> {
  const minDays = opts.minDays ?? FOLLOWUP_DEFAULT_DAYS;
  const now = Date.now();

  const all = await db
    .select()
    .from(schema.prospects)
    .where(
      and(
        // Only chase prospects we've actually emailed
        // (status is in [emailed, opened, clicked])
        // status NOT in ('replied','meeting','won','lost','ignored','lead','researched','mock_built')
        // … expressed simply via JS filter below
      ),
    );

  // Per-prospect: latest outbound and latest inbound. Done in JS to keep simple.
  const out = await db.select({
    prospectId: schema.emails.prospectId,
    sentAt: schema.emails.sentAt,
    subject: schema.emails.subject,
    direction: schema.emails.direction,
    createdAt: schema.emails.createdAt,
  }).from(schema.emails).orderBy(desc(schema.emails.sentAt));

  const lastByProspect = new Map<number, { outAt: Date | null; outSubj: string | null; inAt: Date | null }>();
  for (const e of out) {
    if (!lastByProspect.has(e.prospectId)) lastByProspect.set(e.prospectId, { outAt: null, outSubj: null, inAt: null });
    const slot = lastByProspect.get(e.prospectId)!;
    const t = e.sentAt ?? e.createdAt;
    if (e.direction === "outbound" && !slot.outAt) {
      slot.outAt = t; slot.outSubj = e.subject;
    } else if (e.direction === "inbound" && !slot.inAt) {
      slot.inAt = t;
    }
  }

  const rows: FollowupRow[] = [];
  for (const p of all) {
    if (!(FOLLOWUP_STATUSES as readonly string[]).includes(p.status)) continue;
    const last = lastByProspect.get(p.id) ?? { outAt: null, outSubj: null, inAt: null };
    if (!last.outAt) continue;
    if (last.inAt && last.inAt > last.outAt) continue; // they replied since we last wrote
    const daysSinceSent = (now - new Date(last.outAt).getTime()) / 86400_000;
    if (daysSinceSent < minDays) continue;
    const isSnoozed = !!(p.snoozedUntil && new Date(p.snoozedUntil).getTime() > now);
    if (isSnoozed && !opts.includeSnoozed) continue;
    rows.push({
      prospect: p,
      lastSent: last.outAt,
      lastReceived: last.inAt,
      daysSinceSent: Math.floor(daysSinceSent),
      lastSubject: last.outSubj,
      isSnoozed,
    });
  }
  rows.sort((a, b) => b.daysSinceSent - a.daysSinceSent);
  return rows;
}
