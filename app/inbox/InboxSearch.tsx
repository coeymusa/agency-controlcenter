"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function InboxSearch({ initial, unread }: { initial: string; unread: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (v.trim()) params.set("q", v.trim());
      if (unread) params.set("unread", "1");
      const qs = params.toString();
      router.replace(qs ? `/inbox?${qs}` : "/inbox", { scroll: false });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      placeholder="search inbox — subject, sender, body, business…"
      style={{ width: "100%", padding: "10px 12px", fontSize: 14 }}
    />
  );
}
