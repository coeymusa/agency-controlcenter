import { NextRequest, NextResponse } from "next/server";

const TOKEN = () => process.env.CONTROL_API_TOKEN ?? "";

export function requireBearer(req: NextRequest): NextResponse | null {
  const expected = TOKEN();
  if (!expected) {
    return NextResponse.json({ error: "Server missing CONTROL_API_TOKEN" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const got = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (got !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function dashboardPasswordOk(input: string): boolean {
  const pw = process.env.DASHBOARD_PASSWORD ?? "";
  if (!pw) return false;
  return input === pw;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 100);
}

export function shortCode(len = 8): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
