import { db, schema } from "./db";
import { desc } from "drizzle-orm";

// Compact rows the command palette consumes. Kept small so we can ship
// everything to the client and let it filter without a roundtrip per keystroke.
export type SearchItem =
  | { kind: "prospect"; slug: string; business: string; contactEmail: string | null; location: string | null; industry: string | null; status: string }
  | { kind: "template"; id: number; name: string; scope: string; subject: string }
  | { kind: "page"; label: string; href: string; hint: string }
  | { kind: "action"; label: string; hint: string; href?: string };

const PAGES: SearchItem[] = [
  { kind: "page", label: "Prospects", href: "/", hint: "browse, filter, kanban" },
  { kind: "page", label: "Inbox", href: "/inbox", hint: "incoming replies" },
  { kind: "page", label: "Follow-ups", href: "/followups", hint: "due for a bump" },
  { kind: "page", label: "Sent", href: "/sent", hint: "everything you've sent" },
  { kind: "page", label: "Scheduled", href: "/scheduled", hint: "queue waiting to send" },
  { kind: "page", label: "Templates", href: "/templates", hint: "reusable email templates" },
  { kind: "page", label: "Bulk send", href: "/bulk-send", hint: "send template to a filtered slice" },
  { kind: "page", label: "Events", href: "/events", hint: "raw activity feed" },
  { kind: "page", label: "Settings", href: "/settings", hint: "Outlook, Gmail, Resend, signature" },
];

export async function getSearchIndex(): Promise<SearchItem[]> {
  const [prospects, templates] = await Promise.all([
    db.select({
      slug: schema.prospects.slug,
      business: schema.prospects.business,
      contactEmail: schema.prospects.contactEmail,
      location: schema.prospects.location,
      industry: schema.prospects.industry,
      status: schema.prospects.status,
    }).from(schema.prospects).orderBy(desc(schema.prospects.updatedAt)),
    db.select({
      id: schema.emailTemplates.id,
      name: schema.emailTemplates.name,
      scope: schema.emailTemplates.scope,
      subject: schema.emailTemplates.subject,
    }).from(schema.emailTemplates).orderBy(desc(schema.emailTemplates.updatedAt)),
  ]);

  const items: SearchItem[] = [...PAGES];
  for (const p of prospects) items.push({ kind: "prospect", ...p });
  for (const t of templates) items.push({ kind: "template", ...t });
  return items;
}
