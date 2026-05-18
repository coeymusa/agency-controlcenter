import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { SCHEMA_SQL } from "./schema-sql";

const url = process.env.DATABASE_URL ?? "";
if (!url) {
  throw new Error("DATABASE_URL is required (set it in .env or Vercel env vars).");
}

function makeDb() {
  // postgres-js works equally well against Supabase (direct or pooler),
  // Neon, plain Postgres, etc. `prepare: false` is needed when going through
  // a transaction pooler (Supabase pooler on port 6543) because pgbouncer
  // doesn't support prepared statements in transaction mode.
  const isPooler = /pooler\.supabase\.com/.test(url);
  const client = postgres(url, {
    prepare: !isPooler,
    max: 5,
    idle_timeout: 30,
    connect_timeout: 10,
    ssl: "require",
  });
  return { client, drizzle: drizzle(client, { schema }) };
}

type Handle = ReturnType<typeof makeDb>;
const g = globalThis as unknown as { __ccDb?: Handle; __ccInit?: boolean };
if (!g.__ccDb) {
  g.__ccDb = makeDb();
}
export const db = g.__ccDb.drizzle;
export const sqlClient = g.__ccDb.client;
export { schema };

// Lazy idempotent schema bootstrap on first use. Safe to call repeatedly.
export async function ensureSchema(): Promise<void> {
  if (g.__ccInit) return;
  await sqlClient.unsafe(SCHEMA_SQL);
  g.__ccInit = true;
}
