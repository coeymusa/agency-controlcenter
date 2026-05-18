"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Wires up j/k/Enter/u/r keyboard shortcuts on the inbox list.
// j/k move the highlighted row, Enter opens the prospect thread, u toggles
// the current row's read state, r jumps straight to the composer for it.
//
// Highlighting is done by adding `data-inbox-focus` to the focused row's
// container; CSS reacts to that selector for the visual ring.

export function InboxKeys() {
  const router = useRouter();
  useEffect(() => {
    let idx = 0;
    const sel = () => Array.from(document.querySelectorAll<HTMLElement>("[data-inbox-row]"));
    const clearFocus = () => {
      for (const el of sel()) el.removeAttribute("data-inbox-focus");
    };
    const focus = (i: number) => {
      const rows = sel();
      if (rows.length === 0) return;
      const clamped = Math.max(0, Math.min(rows.length - 1, i));
      clearFocus();
      const el = rows[clamped];
      el.setAttribute("data-inbox-focus", "1");
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      idx = clamped;
    };
    focus(0);

    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const rows = sel();
      if (rows.length === 0) return;
      const cur = rows[idx];
      if (e.key === "j") { e.preventDefault(); focus(idx + 1); }
      else if (e.key === "k") { e.preventDefault(); focus(idx - 1); }
      else if (e.key === "Enter") { e.preventDefault(); cur?.querySelector<HTMLAnchorElement>("a[data-row-link]")?.click(); }
      else if (e.key === "u") { e.preventDefault(); cur?.querySelector<HTMLButtonElement>("button[data-row-read]")?.click(); }
      else if (e.key === "r") {
        e.preventDefault();
        const link = cur?.querySelector<HTMLAnchorElement>("a[data-row-link]");
        if (link) router.push(link.getAttribute("href")! + "?reply=1");
      }
      else if (e.key === "g") {
        // capture next key for gg (go top)
        const handler = (ev2: KeyboardEvent) => {
          if (ev2.key === "g") { e.preventDefault(); focus(0); }
          window.removeEventListener("keydown", handler);
        };
        window.addEventListener("keydown", handler, { once: true });
      }
      else if (e.key === "G") { e.preventDefault(); focus(rows.length - 1); }
    }
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearFocus(); };
  }, [router]);
  return (
    <div className="dim" style={{ fontSize: 10, textAlign: "right" }}>
      <span className="kbd">j</span>/<span className="kbd">k</span> nav · <span className="kbd">Enter</span> open · <span className="kbd">r</span> reply · <span className="kbd">u</span> toggle read · <span className="kbd">gg</span>/<span className="kbd">G</span> top/bottom
    </div>
  );
}
