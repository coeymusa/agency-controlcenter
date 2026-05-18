import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { dashboardPasswordOk } from "@/lib/auth";

async function action(formData: FormData) {
  "use server";
  const pw = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  if (!dashboardPasswordOk(pw)) {
    redirect(`/login?next=${encodeURIComponent(next)}&err=1`);
  }
  const c = await cookies();
  c.set("control_auth", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  redirect(next);
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; err?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div style={{ maxWidth: 360, margin: "10vh auto" }}>
      <div className="card" style={{ padding: 24 }}>
        <h1 style={{ fontSize: 18, marginBottom: 16 }}>◆ control center</h1>
        <form action={action} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="hidden" name="next" value={sp.next ?? "/"} />
          <input name="password" type="password" placeholder="dashboard password" autoFocus />
          <button className="primary" type="submit">unlock</button>
          {sp.err && <div style={{ color: "#f87171", fontSize: 12 }}>wrong password</div>}
        </form>
      </div>
    </div>
  );
}
