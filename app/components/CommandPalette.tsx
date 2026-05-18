"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchItem } from "@/lib/search";

const STATUS_PILL: Record<string, string> = {
  lead: "slate", researched: "slate", mock_built: "blue", emailed: "blue",
  opened: "amber", clicked: "amber", replied: "green", meeting: "green",
  won: "green", lost: "red", ignored: "red",
};

const SCOPE_PILL: Record<string, string> = { cold: "blue", followup: "amber", breakup: "red", other: "slate" };

function scoreItem(item: SearchItem, q: string): number {
  if (!q) return 0;
  const ql = q.toLowerCase();
  const haystack = (() => {
    switch (item.kind) {
      case "prospect": return [item.business, item.slug, item.contactEmail ?? "", item.location ?? "", item.industry ?? "", item.status].join(" ");
      case "template": return [item.name, item.scope, item.subject].join(" ");
      case "page": return [item.label, item.hint].join(" ");
      case "action": return [item.label, item.hint].join(" ");
    }
  })().toLowerCase();
  if (haystack.includes(ql)) {
    // Exact-prefix on primary label scores highest
    const primary = item.kind === "prospect" ? item.business : item.kind === "template" ? item.name : item.kind === "page" ? item.label : item.label;
    if (primary.toLowerCase().startsWith(ql)) return 100;
    if (primary.toLowerCase().includes(ql)) return 80;
    return 50;
  }
  // Subsequence match: every char of q appears in order in haystack
  let i = 0;
  for (const c of haystack) { if (c === ql[i]) i++; if (i === ql.length) break; }
  return i === ql.length ? 20 : 0;
}

function itemHref(item: SearchItem): string | undefined {
  switch (item.kind) {
    case "prospect": return `/prospects/${item.slug}`;
    case "template": return `/templates`;
    case "page": return item.href;
    case "action": return item.href;
  }
}

export function CommandPalette({ items }: { items: SearchItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Open on Cmd+K / Ctrl+K / "/"
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inField = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "/" && !open && !inField) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQ(""); setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!q.trim()) {
      // Show top items by default — pages first, then a sampling of recent prospects
      return items.slice(0, 30);
    }
    const scored = items.map((item) => ({ item, score: scoreItem(item, q.trim()) })).filter((s) => s.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 40).map((s) => s.item);
  }, [items, q]);

  // Group by kind for rendering
  const grouped = useMemo(() => {
    const g = new Map<SearchItem["kind"], SearchItem[]>();
    for (const it of filtered) {
      if (!g.has(it.kind)) g.set(it.kind, []);
      g.get(it.kind)!.push(it);
    }
    return Array.from(g.entries());
  }, [filtered]);

  // Flat list of items in render order for cursor navigation
  const flat = useMemo(() => grouped.flatMap(([, items]) => items), [grouped]);

  useEffect(() => { setCursor(0); }, [q, open]);

  useEffect(() => {
    if (!open) return;
    function onNav(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(flat.length - 1, c + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const sel = flat[cursor];
        if (!sel) return;
        const href = itemHref(sel);
        if (href) {
          setOpen(false);
          router.push(href);
        }
      }
    }
    window.addEventListener("keydown", onNav);
    return () => window.removeEventListener("keydown", onNav);
  }, [open, flat, cursor, router]);

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 200, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "10vh" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: "min(640px, 92vw)", maxHeight: "75vh", display: "flex", flexDirection: "column", overflow: "hidden", borderColor: "var(--line-2)" }}
      >
        <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="dim" style={{ fontSize: 16 }}>⌘</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to anything — prospect, template, page…"
            style={{ flex: 1, fontSize: 15, padding: "6px 4px", background: "transparent", border: "none", outline: "none" }}
          />
          <span className="kbd">esc</span>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {grouped.length === 0 && (
            <div style={{ padding: 30, textAlign: "center" }}><span className="dim">no matches</span></div>
          )}
          {grouped.map(([kind, items]) => (
            <div key={kind}>
              <div className="dim" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", padding: "10px 14px 4px", background: "var(--panel-2)" }}>
                {kind === "prospect" ? "Prospects" : kind === "template" ? "Templates" : kind === "page" ? "Pages" : "Actions"}
              </div>
              {items.map((item) => {
                const idx = flat.indexOf(item);
                const isCursor = idx === cursor;
                return (
                  <button
                    type="button"
                    key={item.kind + "-" + (item.kind === "prospect" ? item.slug : item.kind === "template" ? item.id : item.kind === "page" ? item.href : item.label)}
                    onClick={() => { const href = itemHref(item); if (href) { setOpen(false); router.push(href); } }}
                    onMouseEnter={() => setCursor(idx)}
                    style={{
                      width: "100%", textAlign: "left", border: "none", borderRadius: 0,
                      background: isCursor ? "var(--accent-dim)" : "transparent",
                      color: "var(--ink)", padding: "10px 14px",
                      display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    <PaletteRow item={item} />
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--dim)" }}>
          <span><span className="kbd">↑</span>/<span className="kbd">↓</span> navigate · <span className="kbd">enter</span> open · <span className="kbd">esc</span> close</span>
          <span>{flat.length} result{flat.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}

function PaletteRow({ item }: { item: SearchItem }) {
  if (item.kind === "prospect") {
    return (
      <>
        <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.business}</span>
        {item.location && <span className="pill slate" style={{ flexShrink: 0 }}>{item.location}</span>}
        {item.industry && <span className="pill purple" style={{ flexShrink: 0 }}>{item.industry}</span>}
        <span className={`pill ${STATUS_PILL[item.status] ?? "slate"}`} style={{ flexShrink: 0 }}>{item.status}</span>
      </>
    );
  }
  if (item.kind === "template") {
    return (
      <>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
        <span className="dim" style={{ fontSize: 11, flex: 1, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.subject}</span>
        <span className={`pill ${SCOPE_PILL[item.scope] ?? "slate"}`} style={{ flexShrink: 0 }}>{item.scope}</span>
      </>
    );
  }
  if (item.kind === "page") {
    return (
      <>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{item.label}</span>
        <span className="dim" style={{ fontSize: 11 }}>{item.hint}</span>
      </>
    );
  }
  return <span>{item.label}</span>;
}
