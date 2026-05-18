#!/usr/bin/env tsx
import "dotenv/config";
import { runOutlookSync } from "../lib/outlook-sync.js";

async function main() {
  const r = await runOutlookSync();
  console.log(`✓ scanned ${r.scanned} messages across ${r.conversations} conversations — ${r.newReplies} new replies`);
}
main().catch((e) => { console.error(e); process.exit(1); });
