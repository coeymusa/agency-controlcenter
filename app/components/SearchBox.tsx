"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [v, setV] = useState(initial);

  useEffect(() => {
    const t = setTimeout(() => {
      const cur = new URLSearchParams(sp.toString());
      const trimmed = v.trim();
      if (trimmed) cur.set("q", trimmed); else cur.delete("q");
      const next = cur.toString();
      const target = next ? `/?${next}` : `/`;
      router.replace(target, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      placeholder="search business · email · notes · slug…"
      style={{ width: "100%", padding: "10px 12px", fontSize: 14 }}
    />
  );
}
