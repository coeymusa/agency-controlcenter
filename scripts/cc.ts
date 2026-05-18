#!/usr/bin/env tsx
/**
 * Claude Control CLI
 *
 *   pnpm cc prospect <business> [--slug s] [--email e] [--website w]
 *                    [--location l] [--industry i] [--status s]
 *                    [--pitch url] [--notes "..."] [--tag a --tag b]
 *
 *   pnpm cc email <prospect-slug> --subject "..." [--to addr] [--from addr]
 *                  [--body "..."] [--link https://x] [--link https://y]
 *                  [--direction outbound|inbound] [--gmail-msg-id ..]
 *
 *   pnpm cc note <prospect-slug> [--text "..."] [--type note|status_change]
 *
 *   pnpm cc status <prospect-slug> <status>   # quick status change
 *   pnpm cc tag <prospect-slug> <tag> [...]   # add tags (merges with existing)
 *   pnpm cc untag <prospect-slug> <tag>       # remove a tag
 *   pnpm cc delete <prospect-slug>            # delete prospect + cascades
 *   pnpm cc export [--format csv|json]        # dump everything
 *
 *   pnpm cc list                              # prospects
 *   pnpm cc show <prospect-slug>              # detail
 *   pnpm cc events                            # all events
 *
 * Reads CONTROL_API_TOKEN + NEXT_PUBLIC_TRACK_BASE (or CONTROL_BASE_URL) from .env.
 */
import "dotenv/config";

const BASE =
  process.env.CONTROL_BASE_URL ??
  process.env.NEXT_PUBLIC_TRACK_BASE ??
  "http://localhost:3000";
const TOKEN = process.env.CONTROL_API_TOKEN ?? "";

function die(msg: string): never {
  console.error("✗ " + msg);
  process.exit(1);
}

if (!TOKEN) die("CONTROL_API_TOKEN missing in .env");

type ArgMap = { _: string[]; flags: Record<string, string | string[] | true> };

function parseArgs(argv: string[]): ArgMap {
  const _: string[] = [];
  const flags: Record<string, string | string[] | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        flags[key] = true;
      } else {
        i++;
        const prev = flags[key];
        if (prev === undefined) flags[key] = next;
        else if (Array.isArray(prev)) prev.push(next);
        else flags[key] = [prev as string, next];
      }
    } else {
      _.push(a);
    }
  }
  return { _, flags };
}

function flagStr(a: ArgMap, k: string): string | undefined {
  const v = a.flags[k];
  return typeof v === "string" ? v : undefined;
}
function flagArr(a: ArgMap, k: string): string[] {
  const v = a.flags[k];
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return [v];
  return [];
}

async function api(path: string, body?: unknown, method = "POST") {
  const res = await fetch(BASE + path, {
    method: body !== undefined ? method : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + TOKEN,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    const txt = await res.text();
    if (!res.ok) die(`${method} ${path} → ${res.status}`);
    return txt;
  }
  const txt = await res.text();
  let json: any;
  try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
  if (!res.ok) die(`${method} ${path} → ${res.status}: ${txt}`);
  return json;
}

async function cmdProspect(a: ArgMap) {
  const business = a._[0];
  if (!business) die("usage: cc prospect <business> [...]");
  const tags = flagArr(a, "tag");
  const body = {
    business,
    slug: flagStr(a, "slug"),
    contactName: flagStr(a, "contact"),
    contactEmail: flagStr(a, "email"),
    website: flagStr(a, "website"),
    location: flagStr(a, "location"),
    industry: flagStr(a, "industry"),
    status: flagStr(a, "status") as any,
    pitchUrl: flagStr(a, "pitch"),
    notes: flagStr(a, "notes"),
    tags: tags.length ? tags : undefined,
  };
  const out = await api("/api/prospects", body);
  console.log((out.created ? "+ created " : "~ updated ") + out.prospect.slug + " (#" + out.prospect.id + ")");
  console.log("  status: " + out.prospect.status);
}

async function cmdEmail(a: ArgMap) {
  const slug = a._[0];
  if (!slug) die("usage: cc email <prospect-slug> --subject ...");
  const subject = flagStr(a, "subject");
  if (!subject) die("--subject required");
  const links = flagArr(a, "link").map((u) => ({ target: u }));
  const body = {
    prospectSlug: slug,
    subject,
    direction: (flagStr(a, "direction") ?? "outbound") as "outbound" | "inbound",
    toAddr: flagStr(a, "to"),
    fromAddr: flagStr(a, "from"),
    bodyText: flagStr(a, "body"),
    bodyHtml: flagStr(a, "html"),
    gmailMessageId: flagStr(a, "gmail-msg-id"),
    gmailThreadId: flagStr(a, "gmail-thread-id"),
    outlookMessageId: flagStr(a, "outlook-msg-id"),
    outlookConversationId: flagStr(a, "outlook-conv-id"),
    internetMessageId: flagStr(a, "internet-msg-id"),
    trackLinks: links.length ? links : undefined,
  };
  const out = await api("/api/emails", body);
  console.log("+ email #" + out.email.id + " logged for " + slug);
  console.log("  pixel: " + out.trackingPixel);
  if (out.links?.length) {
    console.log("  tracked links:");
    for (const l of out.links) console.log("    " + l.trackUrl + "  →  " + l.target);
  }
}

async function cmdNote(a: ArgMap) {
  const slug = a._[0];
  if (!slug) die("usage: cc note <prospect-slug> [--text ...] [--type ...]");
  const out = await api("/api/events", {
    prospectSlug: slug,
    type: (flagStr(a, "type") ?? "note") as any,
    metadata: { text: flagStr(a, "text") ?? "" },
  });
  console.log("+ event #" + out.event.id + " (" + out.event.type + ")");
}

async function cmdList() {
  const out = await api("/api/prospects", undefined);
  const rows: any[] = out.prospects;
  if (rows.length === 0) {
    console.log("(no prospects)");
    return;
  }
  for (const p of rows) {
    console.log(
      `${p.status.padEnd(11)} ${p.slug.padEnd(35)} ${(p.contactEmail ?? "—").padEnd(32)} ${p.business}`,
    );
  }
}

async function cmdShow(a: ArgMap) {
  const slug = a._[0];
  if (!slug) die("usage: cc show <slug>");
  const out = await api("/api/prospects/" + slug, undefined);
  console.log(JSON.stringify(out, null, 2));
}

async function cmdEvents() {
  const out = await api("/api/events", undefined);
  for (const e of out.events) {
    console.log(`${new Date(e.occurredAt).toISOString()}  ${e.type.padEnd(14)} p#${e.prospectId ?? "—"} ${JSON.stringify(e.metadata ?? {})}`);
  }
}

async function cmdStatus(a: ArgMap) {
  const [slug, status] = a._;
  if (!slug || !status) die("usage: cc status <slug> <status>");
  const out = await api("/api/prospects/" + slug, { status }, "PATCH");
  console.log("~ " + slug + " → " + out.prospect.status);
}

async function cmdTag(a: ArgMap) {
  const [slug, ...adds] = a._;
  if (!slug || adds.length === 0) die("usage: cc tag <slug> <tag> [...]");
  const current = await api("/api/prospects/" + slug, undefined);
  const tags = Array.from(new Set([...(current.prospect.tags ?? []), ...adds]));
  const out = await api("/api/prospects/" + slug, { tags }, "PATCH");
  console.log("~ " + slug + " tags: " + (out.prospect.tags ?? []).join(", "));
}

async function cmdUntag(a: ArgMap) {
  const [slug, ...removes] = a._;
  if (!slug || removes.length === 0) die("usage: cc untag <slug> <tag>");
  const current = await api("/api/prospects/" + slug, undefined);
  const tags = ((current.prospect.tags ?? []) as string[]).filter((t) => !removes.includes(t));
  const out = await api("/api/prospects/" + slug, { tags }, "PATCH");
  console.log("~ " + slug + " tags: " + (out.prospect.tags ?? []).join(", "));
}

async function cmdDelete(a: ArgMap) {
  const slug = a._[0];
  if (!slug) die("usage: cc delete <slug>");
  if (!a.flags["yes"]) {
    process.stdout.write(`! about to delete ${slug} (and all its emails/events). re-run with --yes to confirm.\n`);
    return;
  }
  await api("/api/prospects/" + slug, "", "DELETE");
  console.log("- deleted " + slug);
}

async function cmdExport(a: ArgMap) {
  const fmt = flagStr(a, "format") ?? "csv";
  const out = await api("/api/export?format=" + fmt, undefined);
  process.stdout.write(typeof out === "string" ? out : JSON.stringify(out, null, 2));
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = parseArgs(argv.slice(1));
  switch (cmd) {
    case "prospect": return cmdProspect(rest);
    case "email": return cmdEmail(rest);
    case "note": return cmdNote(rest);
    case "status": return cmdStatus(rest);
    case "tag": return cmdTag(rest);
    case "untag": return cmdUntag(rest);
    case "delete": return cmdDelete(rest);
    case "export": return cmdExport(rest);
    case "list": return cmdList();
    case "show": return cmdShow(rest);
    case "events": return cmdEvents();
    default:
      console.log("commands: prospect | email | note | status | tag | untag | delete | export | list | show | events");
      console.log("see scripts/cc.ts header for flags");
  }
}

main().catch((e) => die(String(e)));
