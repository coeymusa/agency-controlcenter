#!/usr/bin/env tsx
/**
 * Insert (or refresh) the canonical Corey cold + follow-up + break-up
 * templates. Matches the voice from memory:
 *   - Cardiff software developer based in Switzerland
 *   - No em-dashes, no en-dashes, no apologetic opt-outs
 *   - Three bullet teaser, URL on its own line, fixed pricing block,
 *     hard close with 10-day deadline and takedown threat
 *
 * Idempotent: if a template with the same name exists, the body/subject is
 * updated in place. Run any time the canonical wording changes.
 */
import "dotenv/config";
import postgres from "postgres";

const TEMPLATES = [
  {
    name: "Cold pitch — canonical (Corey)",
    scope: "cold",
    subject: "A few specific fixes for {{website}}",
    body:
`Hi, I'm Corey. A Cardiff software developer based in Switzerland, where I
run a couple of regulated businesses on the side (a credit-union loan
platform and a rugby recruitment platform). I rebuild small-business sites
in my spare time when the current one is leaving conversions on the table.

I've already built a working mini-site preview of a rebuilt {{website}}
(clickable, not just mockups). Three things stood out:

{{issues}}

The full rebuild is live, so you can click through it before deciding
anything:

{{pitchUrl}}

If it's useful: £2,000 fixed for the rebuild, £150 a month for hosting
and ongoing care. Optional £50 a month for an embedded chatbot. No
retainer, no contract, no in-person visits (I'm fully remote).

To talk, reply with two or three 20-minute video-call slots in the next
ten days. I take on three regional builds this quarter and first confirmed
wins the slot. If I don't hear back by {{deadline}}, the proposal site
comes down.

Best,
Corey Musa
+44 7884 442 651
corey@builtbycorey.com`,
  },
  {
    name: "Follow-up — canonical (Corey)",
    scope: "followup",
    subject: "Re: A few specific fixes for {{website}}",
    body:
`Hi, bumping the {{business}} proposal in case it slipped past.

The rebuild is still live:

{{pitchUrl}}

Same offer: £2,000 fixed, £150 a month for hosting, optional £50 for the
chatbot. Reply with two or three 20-minute video-call slots in the next
week if you want to talk. If I don't hear back by {{shortDeadline}}, I'll
take the proposal site down and reuse the slot.

Best,
Corey Musa
+44 7884 442 651
corey@builtbycorey.com`,
  },
  {
    name: "Break-up — canonical (Corey)",
    scope: "breakup",
    subject: "Closing the loop on {{business}}",
    body:
`Hi, I'll take the silence as a not-now and stop nudging.

The rebuild stays at {{pitchUrl}} until end of next week, then it comes
down. If anything changes before then, reply with a slot or two and I'll
hold it.

Best,
Corey Musa
+44 7884 442 651
corey@builtbycorey.com`,
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL missing"); process.exit(1); }
  const sql = postgres(url, { ssl: "require", max: 1 });
  for (const t of TEMPLATES) {
    const existing = await sql<{ id: number }[]>`select id from email_templates where name = ${t.name}`;
    if (existing.length > 0) {
      await sql`update email_templates set subject = ${t.subject}, body = ${t.body}, scope = ${t.scope}, updated_at = now() where id = ${existing[0].id}`;
      console.log("~ updated " + t.name);
    } else {
      await sql`insert into email_templates (name, scope, subject, body) values (${t.name}, ${t.scope}, ${t.subject}, ${t.body})`;
      console.log("+ inserted " + t.name);
    }
  }
  await sql.end();
  console.log("✓ done");
}

main().catch((e) => { console.error(e); process.exit(1); });
