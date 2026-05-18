"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateStatus,
  addTag,
  removeTag,
  updateNotes,
  updateContact,
  updatePitchIssues,
  deleteProspect,
} from "./actions";
import { ALL_STATUSES } from "@/lib/classify";

type Prospect = {
  slug: string;
  status: string;
  tags: string[] | null;
  notes: string | null;
  contactName: string | null;
  contactEmail: string | null;
  website: string | null;
  pitchUrl: string | null;
  pitchIssues: string | null;
  location: string | null;
  industry: string | null;
};

export function EditPanel({ prospect }: { prospect: Prospect }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const tags = prospect.tags ?? [];

  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>Edit</div>

      <Row label="Status">
        <select
          value={prospect.status}
          disabled={pending}
          onChange={(e) => start(() => updateStatus(prospect.slug, e.target.value as any).then(() => router.refresh()))}
        >
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Row>

      <Row label="Tags">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              className="pill blue"
              style={{ cursor: "pointer", background: "rgba(147,197,253,.1)" }}
              onClick={() => start(() => removeTag(prospect.slug, t).then(() => router.refresh()))}
            >
              {t} ✕
            </button>
          ))}
          <form
            action={(fd) => start(() => addTag(prospect.slug, String(fd.get("tag") ?? "")).then(() => router.refresh()))}
            style={{ display: "inline-flex", gap: 4 }}
          >
            <input name="tag" placeholder="+ tag" style={{ width: 100, fontSize: 12, padding: "4px 8px" }} />
          </form>
        </div>
      </Row>

      <form
        action={(fd) =>
          start(() =>
            updateContact(prospect.slug, {
              contactName: String(fd.get("contactName") ?? ""),
              contactEmail: String(fd.get("contactEmail") ?? ""),
              website: String(fd.get("website") ?? ""),
              pitchUrl: String(fd.get("pitchUrl") ?? ""),
              location: String(fd.get("location") ?? ""),
              industry: String(fd.get("industry") ?? ""),
            }).then(() => router.refresh()),
          )
        }
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
      >
        <Field name="contactName" label="Contact name" defaultValue={prospect.contactName} />
        <Field name="contactEmail" label="Contact email" defaultValue={prospect.contactEmail} />
        <Field name="website" label="Website" defaultValue={prospect.website} />
        <Field name="pitchUrl" label="Pitch URL" defaultValue={prospect.pitchUrl} />
        <Field name="location" label="Region" defaultValue={prospect.location} />
        <Field name="industry" label="Sector" defaultValue={prospect.industry} />
        <button className="primary" disabled={pending} type="submit" style={{ gridColumn: "1 / -1" }}>
          save contact
        </button>
      </form>

      <form
        id="pitch-issues-form"
        action={(fd) => start(() => updatePitchIssues(prospect.slug, String(fd.get("pitchIssues") ?? "")).then(() => router.refresh()))}
        style={{ display: "flex", flexDirection: "column", gap: 6 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <label className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>Pitch issues (3 teaser bullets)</label>
          <span className="dim" style={{ fontSize: 10 }}>injected as <code>{`{{issues}}`}</code> in the cold template</span>
        </div>
        <textarea
          name="pitchIssues"
          rows={4}
          defaultValue={prospect.pitchIssues ?? ""}
          placeholder={"• Heritage story buried below the product grid, no AggregateRating block, no LocalBusiness schema.\n• Hero loads 4MB hero image with no lazy-loading.\n• Booking flow is 6 clicks deep from the home page."}
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
        />
        <button disabled={pending} type="submit">save issues</button>
      </form>

      <form
        action={(fd) => start(() => updateNotes(prospect.slug, String(fd.get("notes") ?? "")).then(() => router.refresh()))}
        style={{ display: "flex", flexDirection: "column", gap: 6 }}
      >
        <label className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>Notes</label>
        <textarea name="notes" rows={4} defaultValue={prospect.notes ?? ""} />
        <button disabled={pending} type="submit">save notes</button>
      </form>

      <button
        type="button"
        style={{ background: "#3a1717", borderColor: "#5a1f1f", color: "#fca5a5", marginTop: 8 }}
        disabled={pending}
        onClick={() => {
          if (typeof window !== "undefined" && window.confirm(`Delete ${prospect.slug}? Emails + events go with it.`)) {
            start(() => deleteProspect(prospect.slug).then(() => router.push("/")));
          }
        }}
      >
        delete prospect
      </button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</span>
      {children}
    </div>
  );
}

function Field({ name, label, defaultValue }: { name: string; label: string; defaultValue: string | null }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="muted" style={{ fontSize: 11 }}>{label}</span>
      <input name={name} defaultValue={defaultValue ?? ""} />
    </label>
  );
}
