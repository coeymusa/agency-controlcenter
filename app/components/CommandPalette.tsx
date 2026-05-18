"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SearchItem } from "@/lib/search";
import {
  paletteSetStatus, paletteSnooze,
  paletteRunGmailSync, paletteRunOutlookSync, paletteRunDispatch,
} from "./palette-actions";

const STATUS_PILL: Record<string, string> = {
  lead: "slate", researched: "slate", mock_built: "blue", emailed: "blue",
  opened: "amber", clicked: "amber", replied: "green", meeting: "green",
  won: "green", lost: "red", ignored: "red",
};

const SCOPE_PILL: Record<string, string> = { cold: "blue", followup: "amber", breakup: "red", other: "slate" };

type ProspectItem = Extract<SearchItem, { kind: "prospect" }>;

type ActionItem = {
  kind: "action";
  id: string;
  icon: string;
  label: string;
  hint?: string;
  run: () => Promise<void> | void;
};

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
    const primary = item.kind === "prospect" ? item.business : item.kind === "template" ? item.name : item.kind === "page" ? item.label : item.label;
    if (primary.toLowerCase().startsWith(ql)) return 100;
    if (primary.toLowerCase().includes(ql)) return 80;
    return 50;
  }
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
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [drillIn, setDrillIn] = useState<ProspectItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
        if (drillIn) { setDrillIn(null); setQ(""); }
        else setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, drillIn]);

  useEffect(() => {
    if (open) {
      setQ(""); setCursor(0); setDrillIn(null); setToast(null);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const globalActions: ActionItem[] = [
    {
      kind: "action", id: "sync-gmail", icon: "🔄", label: "Sync Gmail replies now",
      hint: "polls every outbound thread for new inbound",
      run: () => start(async () => { const r = await paletteRunGmailSync(); setToast("ok" in r && r.ok ? `Gmail · ${r.received} new` : `Gmail · ${("error" in r) ? r.error : "failed"}`); }),
    },
    {
      kind: "action", id: "sync-outlook", icon: "🔄", label: "Sync Outlook replies now",
      hint: "polls Microsoft Graph for new inbound",
      run: () => start(async () => { const r = await paletteRunOutlookSync(); setToast("ok" in r && r.ok ? `Outlook · ${r.received} new` : `Outlook · ${("error" in r) ? r.error : "failed"}`); }),
    },
    {
      kind: "action", id: "dispatch", icon: "🚀", label: "Run scheduled dispatch now",
      hint: "send any queued emails whose time has come",
      run: () => start(async () => { const r = await paletteRunDispatch(); setToast("ok" in r && r.ok ? `Dispatch · ${r.sent} sent` : `Dispatch · ${("error" in r) ? r.error : "failed"}`); router.refresh(); }),
    },
  ];

  // Build the prospect-action list (only when drilled in)
  function actionsFor(p: ProspectItem): ActionItem[] {
    const finish = (msg: string) => { setToast(msg); setDrillIn(null); setQ(""); setOpen(false); router.refresh(); };
    return [
      { kind: "action", id: "open", icon: "↗", label: "Open thread", hint: "/prospects/" + p.slug, run: () => { setOpen(false); router.push(`/prospects/${p.slug}`); } },
      { kind: "action", id: "compose", icon: "📧", label: "Compose new email", hint: "open the composer", run: () => { setOpen(false); router.push(`/prospects/${p.slug}?compose=1`); } },
      { kind: "action", id: "replied", icon: "✅", label: "Mark as replied", run: () => start(async () => { await paletteSetStatus(p.slug, "replied"); finish(`${p.business} → replied`); }) },
      { kind: "action", id: "meeting", icon: "📅", label: "Mark as meeting", run: () => start(async () => { await paletteSetStatus(p.slug, "meeting"); finish(`${p.business} → meeting`); }) },
      { kind: "action", id: "won", icon: "🏆", label: "Mark as won", run: () => start(async () => { await paletteSetStatus(p.slug, "won"); finish(`${p.business} → won`); }) },
      { kind: "action", id: "lost", icon: "✗", label: "Mark as lost", run: () => start(async () => { await paletteSetStatus(p.slug, "lost"); finish(`${p.business} → lost`); }) },
      { kind: "action", id: "ignored", icon: "🔇", label: "Mark as ignored", run: () => start(async () => { await paletteSetStatus(p.slug, "ignored"); finish(`${p.business} → ignored`); }) },
      { kind: "action", id: "snooze1", icon: "💤", label: "Snooze 1 day", run: () => start(async () => { await paletteSnooze(p.slug, 1); finish(`${p.business} snoozed 1d`); }) },
      { kind: "action", id: "snooze3", icon: "💤", label: "Snooze 3 days", run: () => start(async () => { await paletteSnooze(p.slug, 3); finish(`${p.business} snoozed 3d`); }) },
      { kind: "action", id: "snooze7", icon: "💤", label: "Snooze 1 week", run: () => start(async () => { await paletteSnooze(p.slug, 7); finish(`${p.business} snoozed 7d`); }) },
      { kind: "action", id: "unsnooze", icon: "🔓", label: "Unsnooze", run: () => start(async () => { await paletteSnooze(p.slug, null); finish(`${p.business} unsnoozed`); }) },
    ];
  }

  // Filter logic differs depending on mode
  type DisplayItem = SearchItem | ActionItem;

  const filtered: DisplayItem[] = useMemo(() => {
    if (drillIn) {
      const acts = actionsFor(drillIn);
      if (!q.trim()) return acts;
      const ql = q.toLowerCase();
      return acts.filter((a) => a.label.toLowerCase().includes(ql));
    }
    if (!q.trim()) {
      // Default: pages, then a sample of prospects, then global actions
      const seed: DisplayItem[] = [];
      seed.push(...items.filter((i) => i.kind === "page"));
      seed.push(...items.filter((i) => i.kind === "prospect").slice(0, 15));
      seed.push(...globalActions);
      seed.push(...items.filter((i) => i.kind === "template").slice(0, 6));
      return seed;
    }
    const scored = items.map((item) => ({ item, score: scoreItem(item, q.trim()) })).filter((s) => s.score > 0);
    scored.sort((a, b) => b.score - a.score);
    const out: DisplayItem[] = scored.slice(0, 40).map((s) => s.item);
    // Also include matching global actions
    const ql = q.toLowerCase();
    out.push(...globalActions.filter((a) => a.label.toLowerCase().includes(ql) || (a.hint && a.hint.toLowerCase().includes(ql))));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, drillIn]);

  const grouped: [string, DisplayItem[]][] = useMemo(() => {
    if (drillIn) return [["Actions for " + drillIn.business, filtered]];
    const g = new Map<string, DisplayItem[]>();
    const headerFor = (it: DisplayItem) => {
      if (it.kind === "prospect") return "Prospects";
      if (it.kind === "template") return "Templates";
      if (it.kind === "page") return "Pages";
      return "Actions";
    };
    for (const it of filtered) {
      const h = headerFor(it);
      if (!g.has(h)) g.set(h, []);
      g.get(h)!.push(it);
    }
    return Array.from(g.entries());
  }, [filtered, drillIn]);

  const flat: DisplayItem[] = useMemo(() => grouped.flatMap(([, items]) => items), [grouped]);

  useEffect(() => { setCursor(0); }, [q, open, drillIn]);

  useEffect(() => {
    if (!open) return;
    function onNav(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(flat.length - 1, c + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
      else if (e.key === "Tab" || e.key === "ArrowRight") {
        const sel = flat[cursor];
        if (sel && "kind" in sel && sel.kind === "prospect") {
          e.preventDefault();
          setDrillIn(sel);
          setQ("");
        }
      }
      else if (e.key === "Enter") {
        e.preventDefault();
        const sel = flat[cursor];
        if (!sel) return;
        if ("kind" in sel && sel.kind === "action" && "run" in sel) {
          (sel as ActionItem).run();
          return;
        }
        const href = itemHref(sel as SearchItem);
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
          {drillIn && (
            <button type="button" onClick={() => { setDrillIn(null); setQ(""); }} className="ghost" style={{ fontSize: 11, padding: "3px 8px" }}>← back</button>
          )}
          <span className="dim" style={{ fontSize: 16 }}>{drillIn ? "›" : "⌘"}</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={drillIn ? `Action for ${drillIn.business}…` : "Jump to anything — prospect, template, page, action…"}
            style={{ flex: 1, fontSize: 15, padding: "6px 4px", background: "transparent", border: "none", outline: "none" }}
          />
          {pending && <span className="dim" style={{ fontSize: 11 }}>…</span>}
          <span className="kbd">esc</span>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {grouped.length === 0 && (
            <div style={{ padding: 30, textAlign: "center" }}><span className="dim">no matches</span></div>
          )}
          {grouped.map(([header, items]) => (
            <div key={header}>
              <div className="dim" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", padding: "10px 14px 4px", background: "var(--panel-2)" }}>
                {header}
              </div>
              {items.map((item) => {
                const idx = flat.indexOf(item);
                const isCursor = idx === cursor;
                const itemKey = item.kind === "prospect" ? item.slug : item.kind === "template" ? "t" + item.id : item.kind === "page" ? item.href : (item as ActionItem).id;
                return (
                  <button
                    type="button"
                    key={item.kind + "-" + itemKey}
                    onClick={() => {
                      if (item.kind === "action" && "run" in item) { (item as ActionItem).run(); return; }
                      const href = itemHref(item as SearchItem);
                      if (href) { setOpen(false); router.push(href); }
                    }}
                    onMouseEnter={() => setCursor(idx)}
                    style={{
                      width: "100%", textAlign: "left", border: "none", borderRadius: 0,
                      background: isCursor ? "var(--accent-dim)" : "transparent",
                      color: "var(--ink)", padding: "10px 14px",
                      display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    <PaletteRow item={item} canDrill={item.kind === "prospect"} />
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--dim)" }}>
          <span>
            <span className="kbd">↑</span>/<span className="kbd">↓</span> nav · <span className="kbd">enter</span> open
            {!drillIn && <> · <span className="kbd">tab</span> actions</>}
            · <span className="kbd">esc</span> {drillIn ? "back" : "close"}
          </span>
          <span>
            {toast && <span style={{ color: "var(--accent)" }}>{toast}</span>}
            {!toast && <>{flat.length} result{flat.length === 1 ? "" : "s"}</>}
          </span>
        </div>
      </div>
    </div>
  );
}

function PaletteRow({ item, canDrill }: { item: any; canDrill: boolean }) {
  if (item.kind === "prospect") {
    return (
      <>
        <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.business}</span>
        {item.location && <span className="pill slate" style={{ flexShrink: 0 }}>{item.location}</span>}
        {item.industry && <span className="pill purple" style={{ flexShrink: 0 }}>{item.industry}</span>}
        <span className={`pill ${STATUS_PILL[item.status] ?? "slate"}`} style={{ flexShrink: 0 }}>{item.status}</span>
        {canDrill && <span className="dim" style={{ fontSize: 10, marginLeft: 4 }}>↹</span>}
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
  // action
  return (
    <>
      <span style={{ fontSize: 14, flexShrink: 0, width: 18, textAlign: "center" }}>{item.icon ?? "▶"}</span>
      <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{item.label}</span>
      {item.hint && <span className="dim" style={{ fontSize: 11 }}>{item.hint}</span>}
    </>
  );
}
