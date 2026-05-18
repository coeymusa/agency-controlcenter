export type Vars = {
  business?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  website?: string | null;
  pitchUrl?: string | null;
  pitchIssues?: string | null;
  location?: string | null;
  industry?: string | null;
  signature?: string | null;
};

function bareDomain(url: string | null | undefined): string {
  if (!url) return "";
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function todayPlus(days: number): string {
  const d = new Date(Date.now() + days * 86400_000);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

const FIELD_MAP: Record<string, (v: Vars) => string> = {
  business: (v) => v.business ?? "",
  contactName: (v) => v.contactName ?? "",
  firstName: (v) => (v.contactName ?? "").split(/\s+/)[0] ?? "",
  contactEmail: (v) => v.contactEmail ?? "",
  website: (v) => bareDomain(v.website),
  pitchUrl: (v) => v.pitchUrl ?? "",
  issues: (v) => v.pitchIssues ?? "",
  location: (v) => v.location ?? "",
  industry: (v) => v.industry ?? "",
  signature: (v) => v.signature ?? "",
  // Auto-derived
  deadline: () => todayPlus(10),
  shortDeadline: () => todayPlus(7),
};

export const VAR_KEYS = Object.keys(FIELD_MAP) as (keyof typeof FIELD_MAP)[];

export function substitute(template: string, vars: Vars): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, key) => {
    const fn = FIELD_MAP[key as keyof typeof FIELD_MAP];
    return fn ? fn(vars) : `{{${key}}}`;
  });
}

export const STARTER_TEMPLATES = [
  {
    name: "Cold pitch — mock built",
    scope: "cold",
    subject: "Quick mock for {{business}}",
    body:
      "Hi {{firstName}},\n\n" +
      "I'm a developer based in Switzerland who builds websites for small businesses across the UK and IoM. " +
      "I had a free afternoon and built a one-page redesign of your site — short loader, faster on mobile, clearer call-to-action.\n\n" +
      "Have a look: {{pitchUrl}}\n\n" +
      "If it's useful I can do the live cutover in about a week. If not, no hard feelings.\n\n" +
      "{{signature}}",
  },
  {
    name: "Follow-up #1 (5 days)",
    scope: "followup",
    subject: "Re: Quick mock for {{business}}",
    body:
      "Hi {{firstName}},\n\n" +
      "Just bumping this up in case it got buried. The mock is still live at {{pitchUrl}} if you want a look.\n\n" +
      "If now isn't the right time I'll close the loop — just let me know.\n\n" +
      "{{signature}}",
  },
  {
    name: "Final break-up",
    scope: "breakup",
    subject: "Closing the loop · {{business}}",
    body:
      "Hi {{firstName}},\n\n" +
      "I'll take silence as a 'not now' and stop bumping you. " +
      "The mock will stay live for a few weeks at {{pitchUrl}} in case you change your mind.\n\n" +
      "{{signature}}",
  },
];
