"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelScheduled } from "@/app/prospects/[slug]/actions";

export function CancelButton({ emailId }: { emailId: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="ghost"
      disabled={pending}
      style={{ fontSize: 11, background: "#3a1717", borderColor: "#5a1f1f", color: "#fca5a5" }}
      onClick={() => {
        if (typeof window !== "undefined" && !window.confirm("Cancel this scheduled send?")) return;
        start(async () => { await cancelScheduled(emailId); router.refresh(); });
      }}
    >
      cancel
    </button>
  );
}
