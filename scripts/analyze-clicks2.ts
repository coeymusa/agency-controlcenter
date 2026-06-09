import "dotenv/config";
import { sqlClient as sql } from "../lib/db";

function fmt(d: Date | null) {
  if (!d) return "-";
  return new Date(d).toISOString().slice(0, 16).replace("T", " ");
}

async function main() {
  // For each clicker: send time, first/last click, time-to-first-click, distinct days clicked,
  // distinct IPs, whether any mobile UA, total clicks
  const rows = await sql`
    with sends as (
      select prospect_id, min(occurred_at) sent_at
      from events where type='email_sent' group by prospect_id
    ),
    clk as (
      select prospect_id,
        count(*)::int clicks,
        min(occurred_at) first_click,
        max(occurred_at) last_click,
        count(distinct date(occurred_at))::int days,
        count(distinct ip_addr)::int ips,
        bool_or(user_agent ilike '%iphone%' or user_agent ilike '%android%' or user_agent ilike '%mobile%') mobile,
        bool_or(user_agent ilike '%windows nt 6.1%') win7
      from events where type='link_click' group by prospect_id
    )
    select p.id, p.business, p.industry,
      s.sent_at, c.first_click, c.last_click, c.clicks, c.days, c.ips, c.mobile, c.win7,
      extract(epoch from (c.first_click - s.sent_at)) ttfc_sec
    from clk c
    join prospects p on p.id=c.prospect_id
    left join sends s on s.prospect_id=c.prospect_id
    order by c.first_click`;

  console.log("=== CLICKERS: scanner vs human signals ===");
  console.log("id  business                       sent          firstClick    ttfc    clk day ip mob w7");
  for (const r of rows) {
    const ttfc = r.ttfc_sec == null ? "  ?  " :
      r.ttfc_sec < 90 ? `${Math.round(r.ttfc_sec)}s` :
      r.ttfc_sec < 5400 ? `${Math.round(r.ttfc_sec/60)}m` :
      `${(r.ttfc_sec/86400).toFixed(1)}d`;
    console.log(
      String(r.id).padEnd(4),
      String(r.business).slice(0,30).padEnd(30),
      fmt(r.sent_at).padEnd(13),
      fmt(r.first_click).padEnd(13),
      String(ttfc).padStart(6),
      String(r.clicks).padStart(4),
      String(r.days).padStart(3),
      String(r.ips).padStart(3),
      (r.mobile?"Y":"-").padStart(4),
      (r.win7?"y":"-").padStart(3),
    );
  }

  // Distinct IPs across all click events, top by count
  console.log("\n=== TOP CLICK IPs ===");
  const ips = await sql`
    select coalesce(ip_addr,'(null)') ip, count(*)::int n, count(distinct prospect_id)::int prospects
    from events where type='link_click' group by 1 order by n desc limit 25`;
  for (const r of ips) console.log(String(r.ip).padEnd(40), `clicks=${String(r.n).padStart(3)} prospects=${r.prospects}`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
