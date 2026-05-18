"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext, useDraggable, useDroppable, DragEndEvent,
  PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import Link from "next/link";
import { Thumbnail } from "./Thumbnail";
import { updateStatus } from "@/app/prospects/[slug]/actions";

type Status =
  | "lead" | "researched" | "mock_built" | "emailed"
  | "opened" | "clicked" | "replied" | "meeting"
  | "won" | "lost" | "ignored";

const COLUMNS: { id: Status; label: string; pill: string }[] = [
  { id: "lead", label: "Lead", pill: "slate" },
  { id: "researched", label: "Researched", pill: "slate" },
  { id: "mock_built", label: "Mock built", pill: "blue" },
  { id: "emailed", label: "Emailed", pill: "blue" },
  { id: "opened", label: "Opened", pill: "amber" },
  { id: "clicked", label: "Clicked", pill: "amber" },
  { id: "replied", label: "Replied", pill: "green" },
  { id: "meeting", label: "Meeting", pill: "green" },
  { id: "won", label: "Won", pill: "green" },
  { id: "lost", label: "Lost", pill: "red" },
];

function Card({ p }: { p: any }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: p.slug });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.3 : 1,
    cursor: "grab",
  };
  return (
    <div
      ref={setNodeRef}
      style={{ ...style, background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, padding: 8, display: "flex", gap: 8, alignItems: "flex-start" }}
      {...listeners}
      {...attributes}
    >
      <Thumbnail pitchUrl={p.pitchUrl} size="sm" business={p.business} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <Link href={`/prospects/${p.slug}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 500, fontSize: 12, color: "var(--ink)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.business}
        </Link>
        <div className="dim" style={{ fontSize: 10, marginTop: 2 }}>
          {[p.location, p.industry].filter(Boolean).join(" · ") || "—"}
        </div>
      </div>
    </div>
  );
}

function Column({ id, label, pill, items }: { id: Status; label: string; pill: string; items: any[] }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        minWidth: 240, maxWidth: 240, flex: "0 0 240px",
        background: isOver ? "rgba(110,231,183,.05)" : "var(--panel)",
        border: "1px solid " + (isOver ? "var(--accent)" : "var(--line)"),
        borderRadius: 10,
        display: "flex", flexDirection: "column",
        maxHeight: "calc(100vh - 280px)",
      }}
    >
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className={`pill ${pill}`} style={{ fontSize: 11 }}>{label}</span>
        <span className="dim" style={{ fontSize: 11 }}>{items.length}</span>
      </div>
      <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", flex: 1 }}>
        {items.map((p) => <Card key={p.slug} p={p} />)}
        {items.length === 0 && (
          <div className="dim" style={{ fontSize: 11, textAlign: "center", padding: 12 }}>—</div>
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({ rows }: { rows: any[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Optimistic state so cards move instantly even before server confirms
  const [overrides, setOverrides] = useState<Record<string, Status>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function statusOf(p: any): Status {
    return (overrides[p.slug] ?? p.status) as Status;
  }

  function onDragEnd(e: DragEndEvent) {
    const slug = String(e.active.id);
    const newStatus = e.over?.id ? String(e.over.id) as Status : null;
    if (!newStatus) return;
    const row = rows.find((r) => r.slug === slug);
    if (!row || statusOf(row) === newStatus) return;
    setOverrides((o) => ({ ...o, [slug]: newStatus }));
    start(async () => {
      await updateStatus(slug, newStatus as any);
      router.refresh();
    });
  }

  const byCol = new Map<Status, any[]>();
  for (const c of COLUMNS) byCol.set(c.id, []);
  for (const p of rows) {
    const s = statusOf(p);
    if (!byCol.has(s)) byCol.set(s, []);
    byCol.get(s)!.push(p);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
        {COLUMNS.map((col) => (
          <Column key={col.id} id={col.id} label={col.label} pill={col.pill} items={byCol.get(col.id) ?? []} />
        ))}
      </div>
      {pending && <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>saving…</div>}
    </DndContext>
  );
}
