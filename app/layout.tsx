import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { getNavCounts } from "./components/NavCounts";

export const metadata: Metadata = {
  title: "Agency Control Center",
  description: "Proposal + email tracking",
};

function Badge({ n, color }: { n: number; color: string }) {
  if (n === 0) return null;
  return <span style={{ marginLeft: 5, fontSize: 10, padding: "1px 6px", borderRadius: 999, background: color, color: "#06231a", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{n}</span>;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const counts = await getNavCounts().catch(() => ({ inbox: 0, followups: 0 }));
  return (
    <html lang="en">
      <body>
        <header style={{ borderBottom: "1px solid #1f1f24", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <Link href="/" style={{ fontWeight: 700, letterSpacing: ".02em" }}>◆ control</Link>
            <nav style={{ display: "flex", gap: 18, color: "#9b9ba3", fontSize: 13, alignItems: "center" }}>
              <Link href="/">Prospects</Link>
              <Link href="/inbox" style={{ display: "inline-flex", alignItems: "center" }}>
                Inbox<Badge n={counts.inbox} color="#6ee7b7" />
              </Link>
              <Link href="/followups" style={{ display: "inline-flex", alignItems: "center" }}>
                Follow-ups<Badge n={counts.followups} color="#fbbf24" />
              </Link>
              <Link href="/sent">Sent</Link>
              <Link href="/emails">Emails</Link>
              <Link href="/templates">Templates</Link>
              <Link href="/bulk-send">Bulk send</Link>
              <Link href="/events">Events</Link>
              <Link href="/settings">Settings</Link>
            </nav>
          </div>
          <div style={{ color: "#9b9ba3", fontSize: 12 }}>agency-control-center</div>
        </header>
        <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px" }}>{children}</main>
      </body>
    </html>
  );
}
