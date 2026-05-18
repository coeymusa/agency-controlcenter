import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { requireBearer } from "@/lib/auth";
import { desc } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const auth = requireBearer(req);
  if (auth) return auth;
  const fmt = req.nextUrl.searchParams.get("format") ?? "csv";
  const rows = await db.select().from(schema.prospects).orderBy(desc(schema.prospects.updatedAt));

  if (fmt === "json") {
    return NextResponse.json({ prospects: rows });
  }

  const headers = [
    "slug",
    "business",
    "status",
    "region",
    "industry",
    "contactName",
    "contactEmail",
    "website",
    "pitchUrl",
    "tags",
    "notes",
    "createdAt",
    "updatedAt",
  ];
  const lines = [headers.join(",")];
  for (const p of rows) {
    lines.push(
      [
        p.slug,
        p.business,
        p.status,
        p.location,
        p.industry,
        p.contactName,
        p.contactEmail,
        p.website,
        p.pitchUrl,
        (p.tags ?? []).join("|"),
        p.notes,
        p.createdAt.toISOString(),
        p.updatedAt.toISOString(),
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prospects-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
