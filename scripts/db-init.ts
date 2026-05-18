#!/usr/bin/env tsx
import "dotenv/config";
import postgres from "postgres";
import { SCHEMA_SQL } from "../lib/schema-sql.js";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL missing in .env");
    process.exit(1);
  }
  const client = postgres(url, { ssl: "require", max: 1 });
  console.log("Applying schema to " + url.replace(/:[^@/]+@/, ":****@") + " …");
  await client.unsafe(SCHEMA_SQL);
  await client.end();
  console.log("✓ schema ready");
}
main().catch((e) => { console.error(e); process.exit(1); });
