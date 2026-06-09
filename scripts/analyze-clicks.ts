import "dotenv/config";
import { sqlClient as sql } from "../lib/db";

function fmt(d: Date | null) {
  if (!d) return "-";
  return new Date(d).toISOString().slice(0, 16).replace("T", " ");
}

async function main() {
  // Overall funnel counts
  const sent = await sql`select count(distinct prospect_id)::int n from events where type='email_sent'`;
  const opens = await sql`select count(distinct prospect_id)::int n from events where type='email_open'`;
  const clicks = await sql`select count(distinct prospect_id)::int n from events where type='link_click'`;
  const replies = await sql`select count(distinct prospect_id)::int n from events where type='email_reply'`;
  const totalProspects = await sql`select count(*)::int n from prospects`;
  const emailedProspects = await sql`select count(*)::int n from prospects where status not in ('lead','researched','mock_built')`;

  console.log("=== FUNNEL (distinct prospects) ===");
  console.log("prospects total :", totalProspects[0].n);
  console.log("emailed (status):", emailedProspects[0].n);
  console.log("email_sent ev   :", sent[0].n);
  console.log("email_open ev   :", opens[0].n);
  console.log("link_click ev   :", clicks[0].n);
  console.log("email_reply ev  :", replies[0].n);

  // Status breakdown
  const byStatus = await sql`select status, count(*)::int n from prospects group by status order by n desc`;
  console.log("\n=== STATUS BREAKDOWN ===");
  for (const r of byStatus) console.log(String(r.status).padEnd(12), r.n);

  // Everyone who clicked, with detail
  const clickers = await sql`
    select p.id, p.business, p.industry, p.location, p.website, p.pitch_url, p.status,
           p.contact_email,
           count(*) filter (where e.type='link_click')::int clicks,
           count(*) filter (where e.type='email_open')::int opens,
           min(e.occurred_at) filter (where e.type='link_click') first_click,
           max(e.occurred_at) filter (where e.type='link_click') last_click
    from prospects p
    join events e on e.prospect_id = p.id
    where p.id in (select prospect_id from events where type='link_click')
    group by p.id
    order by clicks desc, last_click desc nulls last`;

  console.log(`\n=== CLICKERS (${clickers.length}) ===`);
  for (const c of clickers) {
    console.log(`\n#${c.id} ${c.business}  [${c.status}]`);
    console.log(`   industry: ${c.industry ?? "-"} | loc: ${c.location ?? "-"}`);
    console.log(`   website : ${c.website ?? "-"}`);
    console.log(`   pitch   : ${c.pitch_url ?? "-"}`);
    console.log(`   email   : ${c.contact_email ?? "-"}`);
    console.log(`   clicks=${c.clicks} opens=${c.opens}  first=${fmt(c.first_click)} last=${fmt(c.last_click)}`);
  }

  // Click events with timestamps + UA for clickers (engagement depth signal)
  const clickEvents = await sql`
    select p.business, e.occurred_at, e.user_agent
    from events e join prospects p on p.id=e.prospect_id
    where e.type='link_click'
    order by e.occurred_at desc`;
  console.log(`\n=== ALL CLICK EVENTS (${clickEvents.length}) ===`);
  for (const e of clickEvents) {
    const ua = (e.user_agent ?? "").slice(0, 60);
    console.log(`${fmt(e.occurred_at)}  ${String(e.business).slice(0,28).padEnd(28)} ${ua}`);
  }

  // Industry-level: sent vs clicked
  console.log("\n=== BY INDUSTRY (emailed -> clicked) ===");
  const byInd = await sql`
    select coalesce(p.industry,'?') industry,
      count(distinct p.id) filter (where p.status not in ('lead','researched','mock_built'))::int emailed,
      count(distinct ce.prospect_id)::int clicked
    from prospects p
    left join (select distinct prospect_id from events where type='link_click') ce on ce.prospect_id=p.id
    group by 1 order by emailed desc`;
  for (const r of byInd) {
    const rate = r.emailed ? Math.round((r.clicked / r.emailed) * 100) : 0;
    console.log(String(r.industry).slice(0,24).padEnd(24), `emailed=${String(r.emailed).padStart(3)} clicked=${String(r.clicked).padStart(3)} (${rate}%)`);
  }

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
